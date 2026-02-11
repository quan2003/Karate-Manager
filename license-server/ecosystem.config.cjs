module.exports = {
  apps: [
    {
      name: "karate-license-api",
      script: "server.js",
      instances: "max",
      exec_mode: "cluster",
      watch: false,
      max_memory_restart: "200M",
      env: {
        NODE_ENV: "production",
        PORT: 2000
      },
      env_development: {
        NODE_ENV: "development",
        PORT: 2000
      }
    }
  ]
};
