import { AppVersionService } from './app-version.service';

describe('AppVersionService', () => {
  const service = new AppVersionService();
  const ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ENV };
  });

  it('says nothing when the client reports neither version nor build', () => {
    process.env.MOBILE_ANDROID_LATEST_VERSION = '2.0.0';
    process.env.MOBILE_ANDROID_LATEST_BUILD = '9';
    const res = service.check('android');
    expect(res.updateAvailable).toBe(false);
    expect(res.updateRequired).toBe(false);
  });

  it('flags an older version name', () => {
    process.env.MOBILE_ANDROID_LATEST_VERSION = '1.1.0';
    const res = service.check('android', '1.0.0');
    expect(res.updateAvailable).toBe(true);
    expect(res.updateRequired).toBe(false);
  });

  it('flags an older build even when the version name never moved', () => {
    // The case that motivated the build signal: versionCode 3, 4 and 5 all
    // shipped as "1.0.0", so a name-only check saw them as the same release.
    process.env.MOBILE_ANDROID_LATEST_VERSION = '1.0.0';
    process.env.MOBILE_ANDROID_LATEST_BUILD = '6';
    const res = service.check('android', '1.0.0', 5);
    expect(res.updateAvailable).toBe(true);
  });

  it('is quiet when both signals are current', () => {
    process.env.MOBILE_ANDROID_LATEST_VERSION = '1.0.0';
    process.env.MOBILE_ANDROID_LATEST_BUILD = '6';
    expect(service.check('android', '1.0.0', 6).updateAvailable).toBe(false);
    expect(service.check('android', '1.0.0', 7).updateAvailable).toBe(false);
  });

  it('ignores a build it was given no ceiling for', () => {
    delete process.env.MOBILE_ANDROID_LATEST_BUILD;
    process.env.MOBILE_ANDROID_LATEST_VERSION = '1.0.0';
    const res = service.check('android', '1.0.0', 2);
    expect(res.updateAvailable).toBe(false);
    expect(res.latestBuild).toBeNull();
  });

  it('requires an update below either minimum', () => {
    process.env.MOBILE_ANDROID_MIN_VERSION = '1.2.0';
    expect(service.check('android', '1.1.9').updateRequired).toBe(true);

    process.env.MOBILE_ANDROID_MIN_VERSION = '1.0.0';
    process.env.MOBILE_ANDROID_MIN_BUILD = '5';
    expect(service.check('android', '1.0.0', 4).updateRequired).toBe(true);
    expect(service.check('android', '1.0.0', 5).updateRequired).toBe(false);
  });

  it('offers no store button on iOS until one is configured', () => {
    delete process.env.MOBILE_IOS_STORE_URL;
    expect(service.check('ios', '1.0.0').storeUrl).toBeNull();
  });

  it('rejects a junk build ceiling rather than treating it as zero', () => {
    process.env.MOBILE_ANDROID_LATEST_BUILD = 'soon';
    expect(service.check('android', '1.0.0', 3).latestBuild).toBeNull();
  });
});
