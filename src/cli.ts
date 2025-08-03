#!/usr/bin/env node

import { main } from './index';

// Run the CLI
main().catch((error: any) => {
    console.error('❌ CLI Error:', error);
    process.exit(1);
}); 