# PupVerse for iPhone and iPad

PupVerse now has a Capacitor iOS project that bundles the Vite game, card artwork, and 3D arena code in a native app. This is the build foundation for device testing and an eventual App Store release. It has not been signed, uploaded, or approved by Apple.

## Run locally

Use Node 22.12+ (Node 24 recommended), npm, and Xcode 26+ on a Mac. The native deployment target is iOS 15. Capacitor's [iOS guide](https://capacitorjs.com/docs/ios) describes the supported environment.

```sh
npm ci
npm run ios:sync
npm run ios:open
```

In Xcode, select the **App** scheme, choose an iPhone simulator, and press Run. `npm run ios:run` also builds the web game, syncs it, and opens the CLI device selector. Swift Package Manager downloads the pinned native Capacitor dependency on the first native build; CocoaPods is not required.

Run `npm run ios:sync` after every web or asset change. Vite writes `dist/`; Capacitor copies it into the ignored `ios/App/App/public/` directory. A web preview does not update the native app automatically. The [Capacitor workflow](https://capacitorjs.com/docs/basics/workflow) explains this build/sync cycle.

For an unsigned simulator compilation from the terminal:

```sh
xcodebuild -project ios/App/App.xcodeproj -scheme App \
  -configuration Debug -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /tmp/pupverse-ios-build CODE_SIGNING_ALLOWED=NO build
```

## Configuration and behavior

- `capacitor.config.json` uses `com.example.pupverse` as an explicit development placeholder. Before a signed release, choose an identifier associated with your publisher, update `appId` **and** both Xcode target build configurations, then create the matching App Store Connect app record. Syncing the config alone does not rename an existing native target's bundle identifier.
- The native app loads bundled assets with no remote `server.url`. Keep production builds that way. Public Supabase URL/anonymous-key environment variables must be present when the web build runs; never embed service-role keys.
- The dark native launch screen matches the game. Native safe areas are handled by the web viewport and CSS; check notch, Dynamic Island, home indicator, and landscape layouts on devices.
- Web service-worker registration is skipped in the native app so a stale PWA cache cannot mask a newly bundled version.
- Local progress lives in the app's web storage, separate from Safari. Deleting the app can remove it. Sign-in and cloud synchronization need dedicated device testing before promising progress recovery.
- Guest and password flows need native testing. Email confirmation, password reset, and any OAuth flow currently derive their redirect from `window.location.origin`; a native `capacitor://localhost` origin is not a complete email/deep-link return flow. Configure production HTTPS/universal links and Supabase redirect allowlists, then handle app URL callbacks before releasing these flows.
- The native project currently includes the full card-art directory (about 179 MB before compression). Measure the installed/archive size and optimize source image formats and dimensions before release. App startup and 3D frame rate must be measured on physical devices; simulator rendering is not performance evidence.

## Device acceptance checks

1. Open every arena, change graphics settings, play full battles, and trigger each ability; inspect the rendered stat bonus and round result.
2. Open packs of each rarity with normal and reduced-motion settings; interrupt reveals by backgrounding/resuming and check that rewards are granted exactly once.
3. Test on a smaller/older supported iPhone and iPad, including portrait, landscape, keyboard-open forms, offline launch, reconnect, low-power mode, and repeated arena navigation.
4. Profile frame pacing, memory, battery/thermal behavior, WebGL context recovery, and artwork loading. Check touch targets, contrast, VoiceOver labels, and reduced-motion behavior.
5. Verify guest play, sign-in/out, cloud restore, online matchmaking, disconnections, and the completed native auth redirect flows against the production backend.

## Before TestFlight and App Store submission

- Select the publisher's Apple Developer team, final bundle ID, signing/provisioning, and app version/build number in Xcode. Replace the generated Capacitor app icon with finished 1024×1024 PupVerse artwork.
- Complete the native auth return flows above, production backend configuration, privacy policy/support URLs, account deletion flow where accounts are offered, and App Store privacy/age-rating declarations. Review native dependencies and their [privacy manifests](https://capacitorjs.com/docs/ios/privacy-manifest).
- If real-money coins, packs, or digital unlocks are added, implement the applicable StoreKit purchase flow and disclose randomized-item odds before purchase. No payment integration is included in this foundation. Consult the current [Apple review guidelines](https://developer.apple.com/app-store/review/guidelines/) for the intended storefronts and features.
- Archive the tested Release build in Xcode, validate it, and distribute to TestFlight. Collect device feedback, supply store screenshots/metadata and review access, then submit through App Store Connect. See [Capacitor's deployment guide](https://capacitorjs.com/docs/ios/deploying-to-app-store).

Keep `ios/` source files in version control. Generated web copies, build output, and personal Xcode state are ignored. No signing account or publishing credentials are stored in this project.
