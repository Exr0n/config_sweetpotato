#!/usr/bin/env osascript -l JavaScript
// Usage: osascript -l JavaScript win-vs-screen.js <window-id>
// Prints "<winW> <winH> <screenW> <screenH>" in points for the given window
// (AeroSpace window-id == CoreGraphics window number) and the screen it sits on.
// Prints nothing if the window id isn't found. Used by float-if-small.sh.
ObjC.import('CoreGraphics');
ObjC.import('Foundation');
ObjC.import('AppKit');

function run(argv) {
  var wid = parseInt(argv[0], 10);
  if (!wid) return '';

  // option 0 = all windows (incl. on hidden AeroSpace workspaces); 16 = exclude desktop
  var arr = ObjC.castRefToObject($.CGWindowListCopyWindowInfo(16, 0));
  var b = null;
  for (var i = 0; i < arr.count; i++) {
    var w = arr.objectAtIndex(i);
    if (w.objectForKey('kCGWindowNumber').intValue === wid) {
      b = w.objectForKey('kCGWindowBounds'); // global coords, top-left origin, y down
      break;
    }
  }
  if (!b) return '';
  var winW = b.objectForKey('Width').doubleValue;
  var winH = b.objectForKey('Height').doubleValue;
  var cx = b.objectForKey('X').doubleValue + winW / 2;
  var cy = b.objectForKey('Y').doubleValue + winH / 2;

  var screens = $.NSScreen.screens;
  var primaryH = screens.objectAtIndex(0).frame.size.height; // flip y into NSScreen space
  var fy = primaryH - cy;

  function emit(sw, sh) {
    return [Math.round(winW), Math.round(winH), Math.round(sw), Math.round(sh)].join(' ');
  }
  for (var j = 0; j < screens.count; j++) {
    var f = screens.objectAtIndex(j).frame; // bottom-left origin, points
    if (cx >= f.origin.x && cx < f.origin.x + f.size.width &&
        fy >= f.origin.y && fy < f.origin.y + f.size.height) {
      return emit(f.size.width, f.size.height);
    }
  }
  var p = screens.objectAtIndex(0).frame;
  return emit(p.size.width, p.size.height);
}
