// plugins/withBlePermissions.js
const { withInfoPlist, withAndroidManifest } = require('expo/config-plugins');

function withBlePermissions(config) {
  // iOS: add Bluetooth usage description
  config = withInfoPlist(config, (config) => {
    config.modResults.NSBluetoothAlwaysUsageDescription =
      'This app uses Bluetooth to connect players for local multiplayer poker.';
    return config;
  });

  // Android: add BLE permissions
  config = withAndroidManifest(config, (config) => {
    const mainApplication = config.modResults.manifest;

    // Ensure uses-permission array exists
    if (!mainApplication['uses-permission']) {
      mainApplication['uses-permission'] = [];
    }

    const permissions = [
      'android.permission.BLUETOOTH_SCAN',
      'android.permission.BLUETOOTH_CONNECT',
      'android.permission.BLUETOOTH_ADVERTISE',
      'android.permission.ACCESS_FINE_LOCATION',
    ];

    for (const perm of permissions) {
      const exists = mainApplication['uses-permission'].some(
        (p) => p.$?.['android:name'] === perm
      );
      if (!exists) {
        mainApplication['uses-permission'].push({
          $: { 'android:name': perm },
        });
      }
    }

    return config;
  });

  return config;
}

module.exports = withBlePermissions;
