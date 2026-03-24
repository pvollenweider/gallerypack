#!/usr/bin/env node
import { main } from './gallery.js';
main().catch(e => { process.stderr.write(`  ✗  ${e.message}\n`); process.exit(1); });
