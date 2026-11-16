import type { AuthConfig } from "convex/server";

export default {
  providers: [
    {
      // Clerk Convex JWT template issuer (Frontend API URL)
      // Set CLERK_JWT_ISSUER_DOMAIN on the Convex dashboard for each deployment.
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
