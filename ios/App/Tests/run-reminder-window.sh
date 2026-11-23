#!/bin/sh
set -eu

build_dir=$(mktemp -d)
trap 'rm -rf "$build_dir"' EXIT
swiftc \
  -module-cache-path "$build_dir/module-cache" \
  ios/App/App/ReminderWindow.swift \
  ios/App/Tests/ReminderWindowTests.swift \
  -o "$build_dir/reminder-window-tests"
"$build_dir/reminder-window-tests"
