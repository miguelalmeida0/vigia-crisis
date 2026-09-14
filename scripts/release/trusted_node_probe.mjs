if(process.env.VIGIA_TRUSTED_NODE_LAUNCH!=='1'||process.env.NODE_OPTIONS!==undefined)throw new Error('trusted_node_probe_environment_invalid');
process.stdout.write(`${JSON.stringify({state:'PASS',node:process.execPath,startupEnvironment:'ISOLATED'})}\n`);
