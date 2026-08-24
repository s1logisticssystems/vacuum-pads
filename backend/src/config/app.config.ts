export default () => ({
  app: {
    name: process.env.APP_NAME || 'vacuum-traceability-api',
    port: Number(process.env.PORT || 3000),
  },
  nodeEnv: process.env.NODE_ENV || 'development',
});
