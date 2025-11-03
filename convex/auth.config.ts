export default {
  providers: [
    {
      domain:
        process.env.CONVEX_SITE_URL ||
        process.env.VITE_CONVEX_URL?.replace("/api", "") ||
        "",
      applicationID: "convex",
    },
  ],
};
