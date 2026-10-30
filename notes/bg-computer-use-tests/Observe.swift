import Cocoa
import CoreGraphics
let dir = NSHomeDirectory()+"/.local/state/cua-permission-recovery"
let out = FileHandle(forWritingAtPath: dir+"/observer.jsonl")!
let start = ProcessInfo.processInfo.systemUptime
let initial = NSWorkspace.shared.frontmostApplication!.processIdentifier
let location = CGEvent(source: nil)!.location
var samples = 0
var violations = 0
func record(_ obj: [String: Any]) { let d = try! JSONSerialization.data(withJSONObject: obj, options: [.sortedKeys]); out.write(d); out.write(Data([10])) }
record(["event":"start","pid":initial,"x":location.x,"y":location.y])
let token = NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.didActivateApplicationNotification, object:nil, queue:.main) { n in
 let a = n.userInfo![NSWorkspace.applicationUserInfoKey] as! NSRunningApplication
 record(["event":"activation","pid":a.processIdentifier,"name":a.localizedName ?? "", "t":ProcessInfo.processInfo.systemUptime-start])
 violations += 1
}
let timer = Timer(timeInterval:0.001, repeats:true) { _ in
 samples += 1
 let pid = NSWorkspace.shared.frontmostApplication?.processIdentifier ?? -1
 let p = CGEvent(source:nil)!.location
 if pid != initial || p != location { violations += 1; record(["event":"violation","pid":pid,"x":p.x,"y":p.y,"t":ProcessInfo.processInfo.systemUptime-start]) }
 if FileManager.default.fileExists(atPath:dir+"/observer-stop") {
  record(["event":"end","samples":samples,"violations":violations,"elapsed":ProcessInfo.processInfo.systemUptime-start]); exit(violations == 0 ? 0 : 1)
 }
}
RunLoop.main.add(timer, forMode:.common)
FileManager.default.createFile(atPath:dir+"/observer-ready", contents:Data())
RunLoop.main.run()

