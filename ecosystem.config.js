module.exports = {
  apps: [
    {
      name: "pmdz",

      script: "./index.js",
      node_args: "--max-old-space-size=1536",

      max_memory_restart: "1.5G",

      instances: 1,
      autorestart: true,
      watch: false,
    },
  ],
};
