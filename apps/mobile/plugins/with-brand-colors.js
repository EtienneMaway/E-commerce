const { withAndroidColors, AndroidConfig } = require('expo/config-plugins');

/**
 * Prebuild's Android template ships Expo's own `colorPrimary` (#023c69), which
 * is what native widgets — date pickers, text-selection handles, the ripple on
 * some system dialogs — tint themselves with. Nothing in app.json overrides it,
 * so without this plugin every `expo prebuild` reinstates a stale blue that has
 * nothing to do with the brand.
 *
 * Keep in sync with `lib/theme.ts` / `tailwind.config.js`.
 */
const BRAND_PRIMARY = '#4F46E5';
const BRAND_PRIMARY_DARK = '#4338CA';

module.exports = function withBrandColors(config) {
  return withAndroidColors(config, (cfg) => {
    cfg.modResults = AndroidConfig.Colors.assignColorValue(cfg.modResults, {
      name: 'colorPrimary',
      value: BRAND_PRIMARY,
    });
    cfg.modResults = AndroidConfig.Colors.assignColorValue(cfg.modResults, {
      name: 'colorPrimaryDark',
      value: BRAND_PRIMARY_DARK,
    });
    return cfg;
  });
};
