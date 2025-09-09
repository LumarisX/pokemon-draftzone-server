module.exports = {
  apps: [
    {
      name: "pmdz",

      script: "npm",
      args: "start",

      node_args: `--max-old-space-size=1536`,
      
      env: {
        NODE_OPTIONS: `--inspect=0.0.0.0:${9229 + (parseInt(process.env.NODE_APP_INSTANCE) || 0)}`
      },

      max_memory_restart: "1536M",
    },
  ],
};
