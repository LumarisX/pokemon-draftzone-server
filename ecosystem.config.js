module.exports = {
  apps: [
    {
      name: "pmdz",

      script: "./dist/index.js",

      node_args: `--max-old-space-size=1536`,

      max_memory_restart: "1536M",
    },
  ],
};
