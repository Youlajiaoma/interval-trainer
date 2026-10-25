/* The app version is maintained here; deployment replaces the local build ID. */
(function (scope) {
  'use strict';
  const info = Object.freeze({version:'2.18.10', build:'local'});
  scope.TonaloomBuildInfo = info;

  if (typeof document === 'undefined') return;
  const version = document.getElementById('app-version');
  const build = document.getElementById('app-build');
  if (version) version.textContent = info.version;
  if (build) build.textContent = info.build === 'local' ? '本地开发版' : `构建 ${info.build}`;
})(typeof self === 'undefined' ? window : self);
