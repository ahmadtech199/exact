// The alternate launcher icons `@exact/app-icon` chooses among on Android, made as agent-android.mjs's
// `androidIcons` makes the primary's adaptive icon.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { placeRgba, readPng, resize } from './app-icons.mjs';
import { encodePng } from './png.mjs';

// The adaptive icon's layer, 108 dp, and the maskable image on it, 82.5 dp, in pixels at xxxhdpi (4 px a dp). At
// 82.5 dp the image's W3C safe zone (the centred circle of 80% diameter) is the layer's 66 dp one (developer.android.com,
// "Adaptive icons").
export const LAYER = 432, MASKABLE = 330;
/** A CSS hex colour (#RGB, #RRGGBB or #RRGGBBAA) as an Android colour resource's #AARRGGBB. */
export const androidColour = (css) => {
  const hex = css.length === 4 ? [...css.slice(1)].map((c) => c + c).join('') : css.slice(1);
  return `#${hex.slice(6) || 'ff'}${hex.slice(0, 6)}`.toUpperCase();
};

/** The alternate launcher icons `@exact/app-icon` chooses among, from app.json's `"packages": {"@exact/app-icon":
 * {"android": {"icons": {"<Name>": "<square PNG of at least 432 px>"}}}}`: each an adaptive icon under `res` made as
 * the primary's maskable one is, over its own top-left pixel, and the manifest lines that move the activity's launcher
 * entry to the alias `dev.exact.app.ExactIcon` (the primary icon, `primary`) and add a disabled alias
 * `dev.exact.app.ExactIcon<Name>` per icon. Null when the app names none. Throws on a refused name or image. */
export function androidAlternateIcons(icons, dir, res, primary) {
  if (icons == null) return null;
  if (typeof icons !== 'object' || Array.isArray(icons) || !Object.keys(icons).length) throw new Error('app.json\'s "@exact/app-icon" android "icons" must map each icon\'s name to a PNG');
  if (!primary) throw new Error('alternate icons need a primary one: app.json\'s icons have none for Android');
  const entries = Object.entries(icons).map(([name, src]) => {
    if (!/^[A-Z][A-Za-z0-9]*$/.test(name)) throw new Error(`the alternate icon name ${JSON.stringify(name)} must be letters and digits, starting with a capital`);
    const path = resolve(dir, String(src));
    if (!existsSync(path)) throw new Error(`the alternate icon ${name}'s ${src} does not exist`);
    const image = readPng(path);
    if (image.width !== image.height || image.width < LAYER) throw new Error(`the alternate icon ${name}'s ${src} is ${image.width}×${image.height}; it must be square and at least ${LAYER} px`);
    return { name, path, image, sha256: createHash('sha256').update(readFileSync(path)).digest('hex') };
  });
  rmSync(res, { recursive: true, force: true });
  const write = (path, bytes) => { mkdirSync(dirname(resolve(res, path)), { recursive: true }); writeFileSync(resolve(res, path), bytes); };
  const colours = [];
  for (const { name, image } of entries) {
    const id = `exact_icon_${name.toLowerCase()}`, corner = `#${[...image.data.subarray(0, 3)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    colours.push(`    <color name="${id}_background">${androidColour(corner)}</color>`);
    write(`drawable-nodpi/${id}_foreground.png`, encodePng(placeRgba(LAYER, LAYER, resize(image, MASKABLE, MASKABLE), (LAYER - MASKABLE) / 2, (LAYER - MASKABLE) / 2)));
    write(`mipmap-anydpi/${id}.xml`, ['<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">',
      `    <background android:drawable="@color/${id}_background" />`, `    <foreground android:drawable="@drawable/${id}_foreground" />`, '</adaptive-icon>', ''].join('\n'));
  }
  write('values/exact_icon_alternates.xml', `<resources>\n${colours.join('\n')}\n</resources>\n`);
  const launcher = (leanback) => ['            <intent-filter>', '                <action android:name="android.intent.action.MAIN" />',
    '                <category android:name="android.intent.category.LAUNCHER" />', ...(leanback ? ['                <category android:name="android.intent.category.LEANBACK_LAUNCHER" />'] : []), '            </intent-filter>'];
  const alias = (suffix, icon, enabled) => [
    `        <activity-alias android:name="dev.exact.app.ExactIcon${suffix}" android:targetActivity="dev.exact.app.MainActivity" android:exported="true" android:enabled="${enabled}"`,
    `            android:icon="${icon}" android:roundIcon="${icon}">`, ...launcher(enabled),
    '            <meta-data android:name="android.app.shortcuts" android:resource="@xml/exact_shortcuts" />', '        </activity-alias>'];
  const lines = [...alias('', primary, true), ...entries.flatMap(({ name }) => alias(name, `@mipmap/exact_icon_${name.toLowerCase()}`, false))];
  const unlisted = launcher(true).map((l, i) => i === 0 ? l.replace('<intent-filter>', '<intent-filter tools:node="remove">') : l);
  return { lines, unlisted, files: entries.map(({ path, sha256 }) => ({ file: path, sha256 })) };
}
