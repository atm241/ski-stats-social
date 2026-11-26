import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * app.json plus HealthKit. Store builds (APP_VARIANT=production, set in eas.json) only read from
 * Health; development builds may also write, for the "add a test ski day" button.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const production = process.env.APP_VARIANT === "production";
  return {
    ...config,
    name: config.name ?? "Gapr",
    slug: config.slug ?? "gapr",
    plugins: [
      ...(config.plugins ?? []),
      [
        "@kingstinct/react-native-healthkit",
        {
          NSHealthShareUsageDescription: "Gapr reads your skiing and snowboarding workouts and their GPS routes to log your days, vertical and top speed. Nothing else from Health is read.",
          NSHealthUpdateUsageDescription: production ? false : "Development builds can add a test ski workout to Health.",
          background: true,
        },
      ],
    ],
  };
};
