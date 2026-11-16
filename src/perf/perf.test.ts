import { writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import { describe, expect, it } from 'vitest';
import * as api from '../backend/api';
import { DEMO_PASSWORD, initUsers, login } from '../backend/auth';
import { gateway } from '../backend/edge';
import { clock, db, seed } from '../backend/store';
import { MAX_CHART_POINTS } from '../domain/config';

const pct = (arr: number[], p: number) => { const s = [...arr].sort((a, b) => a - b); return +s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))].toFixed(3); };

describe('performance profile (node runner, in-process API)', () => {
  it('measures seed, history API latency, ingestion throughput and replay', async () => {
    const t0 = performance.now();
    seed();
    const seedMs = performance.now() - t0;
    await initUsers();
    const s = await login('dr.okafor', DEMO_PASSWORD);
    const ctx = { sid: s.sid, csrf: s.csrf };
    const wins: api.WindowKey[] = ['15m', '1h', '24h', '7d', '30d', 'mission'];
    const lat: number[] = [];
    let maxPts = 0;
    for (let i = 0; i < 300; i++) {
      const a = ['AST-001', 'AST-002', 'AST-003', 'AST-004'][i % 4];
      const t = performance.now();
      const h = api.history(ctx, a, 'heart_rate', wins[i % wins.length]);
      lat.push(performance.now() - t);
      maxPts = Math.max(maxPts, h.displayCount);
    }
    const sumLat: number[] = [];
    for (let i = 0; i < 100; i++) { const t = performance.now(); api.crewSummary(ctx, 'AST-001'); sumLat.push(performance.now() - t); }

    // 20 events/s for a simulated 10-minute window = 12,000 events via the gateway (6 astronauts' streams)
    gateway.adapter.start();
    const start = clock.now() - 600_000;
    const before = db.measurements.length;
    const ti = performance.now();
    for (let k = 0; k < 600 * 4; k++) {
      const now = start + k * 250;
      for (let j = 0; j < 5; j++) {
        const astro = db.astronauts[(k * 5 + j) % 6].id;
        gateway.enqueue([gateway.adapter.envelope(astro, 'heart_rate', 60 + (k % 20), now)]);
      }
      if (k % 8 === 0) gateway.flush(start + k * 250 + 30_000, 1000);
    }
    gateway.flush(clock.now(), 100_000);
    const ingestMs = performance.now() - ti;
    const ingested = db.measurements.length - before;

    // Disconnect → queue 1,000 → reconnect replay
    gateway.setLink('disconnected');
    for (let k = 0; k < 1000; k++) gateway.enqueue([gateway.adapter.envelope('AST-002', 'respiratory_rate', 14, clock.now() - 120_000 + k * 100)]);
    const tr = performance.now();
    gateway.setLink('connected');
    gateway.flush(clock.now(), 100_000);
    const replayMs = performance.now() - tr;
    gateway.adapter.stop();

    const result = {
      runner: { node: process.version, platform: `${os.platform()} ${os.arch()}`, cpu: os.cpus()[0]?.model, cores: os.cpus().length, date: new Date().toISOString() },
      dataset: { astronauts: db.astronauts.length, seeded_measurements: before, seed_ms: +seedMs.toFixed(1) },
      history_api_ms: { samples: lat.length, p50: pct(lat, 50), p95: pct(lat, 95), max: pct(lat, 100) },
      crew_summary_api_ms: { samples: sumLat.length, p50: pct(sumLat, 50), p95: pct(sumLat, 95) },
      max_display_points_per_series: maxPts, max_display_points_limit: MAX_CHART_POINTS,
      ingestion: { events: ingested, wall_ms: +ingestMs.toFixed(1), events_per_s: Math.round(ingested / (ingestMs / 1000)) },
      replay: { queued: 1000, wall_ms: +replayMs.toFixed(1) },
      not_measured: ['browser ingestion-to-visible latency (no runnable browser)', 'main-thread long tasks', '10 concurrent browser sessions', 'memory in browser'],
    };
    mkdirSync('artifacts/verification', { recursive: true });
    writeFileSync('artifacts/verification/perf.json', JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    expect(ingested).toBe(12000);
    expect(maxPts).toBeLessThanOrEqual(MAX_CHART_POINTS);
  }, 120000);
});
