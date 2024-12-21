# set hostname
```
scutil --set ComputerName "sweetpotato"
scutil --set LocalHostName "sweetpotato"
scutil --set HostName "sweetpotato"
defaults write -g InitialKeyRepeat -int 10 
defaults write -g KeyRepeat -int 1
```

# download apps

- arc
- alacritty
- raycast
- karabiner
- amphetamine
- toggl
- fantastical
- chatgpt
- telegram
- discord

# basic shell setup
- Disable SIP for yabai. 

```
git clone git@github.com:Exr0n/config_sweetpotato.git ~/.config                                   # clone
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"   # brew
brew install koekeishiya/formulae/yabai koekeishiya/formulae/skhd                                 # yabai, skhd
sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"   # install oh-my-zsh                             
```

Re-run until the system permissions are all granted 
```
yabai --start-service
skhd --start-service
```


## git settings
```
git config --global push.autoSetupRemote true
git config --global user.name Exr0n
git config --global user.email howdy@exr0n.com
git config --global pull.rebase false
```


# packages
brew install skhd neovim pass coreutils zoxide moreutils lsd rm-improved ag

# settings
## set option to command and command to option 
## set up spaces
- disable automatically rearrange spaces by most recent use
- disable switching to space containing application when switching to application
- disable grouping windows by application
- enable displays have seprate spaces:
## reduce animations
- enable reduce motion in accessibility

# browser setup
- [dark reader](https://chromewebstore.google.com/detail/dark-reader/eimadpbcbfnmbkopoojfekhnkhdbieeh)
- [surfing keys](https://chromewebstore.google.com/detail/surfingkeys/gfbliohnnapiefjpjlpjnehglfpaknnc?hl=en-US), and `;s` to disable pdf viewer
- [youtube speed control](https://chromewebstore.google.com/detail/youtube-playback-speed-co/hdannnflhlmdablckfkjpleikpphncik?hl=en-US)
- [icloud passwords](https://chromewebstore.google.com/detail/icloud-passwords/pejdijmoenmkgeppbflobdenhhabjlaj)
- [tampermonkey](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo) and add desmos darkmode script
- [unhook youtube](https://chromewebstore.google.com/detail/unhook-remove-youtube-rec/khncfooichmfjbepaaaebmommgaepoid?hl=en)
- [ublock](https://chromewebstore.google.com/detail/ublock-origin/cjpalhdlnbpafiamejdnhcphjbkeiagm?hl=en)


# other random stuff
- https://github.com/magicien/GLTFQuickLook
