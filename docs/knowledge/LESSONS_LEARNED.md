# Lessons learned (verified)
- `android-actions/setup-android@v3` failed on GitHub runners (2026-11-02, run 41379336457) with "Failed to find package 'tools'". The ubuntu-latest image already ships the SDK; install only needed packages with `sdkmanager` instead. (Studio-wide candidate; flagged for owner review, no other repo touched.)
- Android JVM unit tests cannot use `com.sun.net.httpserver` (not on the Android compile classpath); use a small `ServerSocket` mock.
- A promise helper that resolves from both a button handler and an `onClose` hook must resolve the chosen value BEFORE closing, or every dialog yields `undefined` (found by the UI smoke test).
