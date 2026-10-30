import json, pathlib, subprocess, time
d=pathlib.Path.home()/".local/state/cua-permission-recovery"
driver="/Applications/CuaDriver.app/Contents/MacOS/cua-driver"
receipt={"calls":[]}
def call(name,a):
 a["session"]="acceptance-proof"
 r=subprocess.run(["python3",str(d/"bg-computer-use"),name,json.dumps(a)],capture_output=True,text=True,check=True)
 v=json.loads(r.stdout); receipt["calls"].append({"tool":name,"arguments":a,"result":v})
 if v.get("status")=="refused": raise AssertionError(v)
 return v
try:
 deadline=time.monotonic()+5
 while not (d/"observer-ready").exists():
  if time.monotonic()>deadline: raise TimeoutError("observer not ready")
  time.sleep(.01)
 windows=json.loads(subprocess.check_output([driver,"call","list_windows","{}"]))
 w=next(w for w in windows["windows"] if w["title"]=="Cua Background Acceptance")
 target={"pid":w["pid"],"window_id":w["window_id"]}
 s=call("get_window_state",{**target,"tree_format":"elements","screenshot_out_file":str(d/"proof-before.png")})
 button=next(x["element_token"] for x in s["elements"] if x.get("label")=="Increment")
 field=next(x["element_token"] for x in s["elements"] if x.get("label")=="Acceptance input")
 before=int((d/"button-count").read_text())
 call("click",{"element_token":button,"delivery_mode":"background"})
 call("set_value",{"element_token":field,"value":"verified background"})
 call("type_text",{"element_token":field,"text":" input","delivery_mode":"background"})
 call("click",{**target,"x":110,"y":122,"delivery_mode":"background"})
 final=call("get_window_state",{**target,"tree_format":"elements","screenshot_out_file":str(d/"proof-after.png")})
 # A diff response can omit unchanged elements; request full structured state for assertions.
 full=call("get_window_state",{**target,"tree_format":"elements","include_screenshot":False})
 assert any(x.get("value")=="verified background input" for x in full["elements"])
 assert int((d/"button-count").read_text())==before+2
 for name,a in [("click",{**target,"delivery_mode":"foreground","x":110,"y":122}),("click",{"scope":"desktop","x":110,"y":122}),("bring_to_front",target)]:
  r=subprocess.run(["python3",str(d/"bg-computer-use"),name,json.dumps(a)],capture_output=True,text=True)
  assert r.returncode==2
  receipt["calls"].append({"tool":name,"arguments":a,"exit":r.returncode,"stderr":r.stderr})
 receipt["status"]="passed"
finally:
 (d/"proof-receipt.json").write_text(json.dumps(receipt,indent=2))
 (d/"observer-stop").touch()
print(json.dumps({"status":receipt.get("status"),"button_count":(d/"button-count").read_text(),"calls":len(receipt["calls"])}))

