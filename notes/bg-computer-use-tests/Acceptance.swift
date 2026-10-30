import Cocoa
final class App: NSObject, NSApplicationDelegate {
 var window: NSWindow!
 var count = 0
 let status = NSTextField(labelWithString: "Count 0")
 func applicationDidFinishLaunching(_ notification: Notification) {
  window = NSWindow(contentRect: NSRect(x: 80, y: 150, width: 480, height: 240), styleMask: [.titled, .closable], backing: .buffered, defer: false)
  window.title = "Cua Background Acceptance"
  let button = NSButton(title: "Increment", target: self, action: #selector(increment))
  button.frame = NSRect(x: 32, y: 130, width: 160, height: 40)
  status.frame = NSRect(x: 32, y: 80, width: 300, height: 32)
  let field = NSTextField(string: "before")
  field.setAccessibilityLabel("Acceptance input")
  field.frame = NSRect(x: 32, y: 30, width: 350, height: 32)
  window.contentView!.addSubview(button); window.contentView!.addSubview(status); window.contentView!.addSubview(field)
  window.orderFront(nil)
  try? "ready".write(toFile: NSHomeDirectory()+"/.local/state/cua-permission-recovery/app-ready", atomically: true, encoding: .utf8)
 }
 @objc func increment() {
  count += 1; status.stringValue = "Count \(count)"
  try? String(count).write(toFile: NSHomeDirectory()+"/.local/state/cua-permission-recovery/button-count", atomically: true, encoding: .utf8)
 }
}
let app = NSApplication.shared
let delegate = App()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()

