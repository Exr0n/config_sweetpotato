// Safe, noninteractive Web Store registration. Never launches or controls Helium.
import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

export const EXTENSIONS = {
  dhdgffkkebhmkfjojejmpbldmpobfkfo: 'Tampermonkey',
  eimadpbcbfnmbkopoojfekhnkhdbieeh: 'Dark Reader',
  ekhagklcjbdpajgpjgmbionohlpdbjgc: 'Zotero Connector',
  pejdijmoenmkgeppbflobdenhhabjlaj: 'iCloud Passwords',
  ghbmnnjooekpmoecnnnilnnbdlolhkhi: 'Google Docs Offline',
  khncfooichmfjbepaaaebmommgaepoid: 'Unhook',
  nglaklhklhcoonedhgnpgddginnjdadi: 'ActivityWatch Web Watcher',
  joggkdfebigddmaagckekihhfncdobff: 'Le Git Graph',
  mmigpkdeeckdeaakmagplioebnoiacdh: 'Claude: Continue from Here',
};
export const SHORTCUT_IDS = []; // Arc is vendored, not a Web Store registration.
export const registration = {external_update_url:'https://clients2.google.com/service/update2/crx'};

export function stage({root=join(homedir(),'Library/Application Support/net.imput.helium'),ids=Object.keys(EXTENSIONS),dryRun=false}={}) {
  const dir=join(root,'External Extensions');
  const output=[];
  // Validate the entire request before any writes.
  for(const id of ids) if(!Object.hasOwn(EXTENSIONS,id)) throw new Error('Unknown curated extension: '+id);
  for(const id of ids) {
    const path=join(dir,id+'.json');
    if(existsSync(path) && JSON.stringify(JSON.parse(readFileSync(path)))!==JSON.stringify(registration))
      throw new Error('Existing external registration differs; refusing overwrite: '+path);
  }
  for(const id of ids) {
    const path=join(dir,id+'.json');
    if(!dryRun) {
      mkdirSync(dir,{recursive:true,mode:0o755});
      if(!existsSync(path)) writeFileSync(path,JSON.stringify(registration,null,2)+'\n',{mode:0o644,flag:'wx'});
      if(JSON.parse(readFileSync(path)).external_update_url!==registration.external_update_url)
        throw new Error('Registration readback mismatch: '+id);
    }
    output.push({id,name:EXTENSIONS[id],registration:path,status:dryRun?'planned':'registered-for-next-start',live:false});
  }
  return output;
}

if(process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1]) {
  const args=process.argv.slice(2);
  if(args.some(a=>!['--shortcuts-only','--dry-run'].includes(a))) throw new Error('Supported flags: --shortcuts-only --dry-run');
  console.log(JSON.stringify(stage({ids:args.includes('--shortcuts-only')?SHORTCUT_IDS:undefined,dryRun:args.includes('--dry-run')}),null,2));
  if(args.includes('--shortcuts-only')) console.log('Arc unpacked source staged at ~/.config/helium/extensions/arc. Load unpacked once in the next normal session, then activate helium/arc-shortcuts.karabiner.json. NOT installed or active.');
  console.log('No windows, tabs, running Preferences, or browser processes touched. Registration is not live installation. Web Store registrations require a future normal start and confirmation; vendored Arc requires one-time Load unpacked.');
}
