#!/bin/zsh


alias check_italics='echo -e "\e[3mitalics?\e[0m"'

export XDG_CONFIG_HOME=$HOME/.config
export XDG_DATA_HOME=$HOME/.caches

source "$XDG_CONFIG_HOME/zsh_custom/lean_p10k.zsh"

#source /home/exr0n/.config/dontrun_custom/env.zsh
#source $XDG_CONFIG_HOME/yabairc

export PATH="$PATH:$HOME/.cargo/bin"
export PATH="/$HOME/.bun/bin:$PATH"

. "$HOME/.cargo/env"

export TYPST_FONT_PATHS="$XDG_CONFIG_HOME/fonts"

# Custom Aliases
eval $(thefuck --alias)
alias tsn='ts-node'
alias trf='ssh exr0n@hop.exr0n.com -p 2222'
alias pls='sudo'
alias u='mkdir -p "$CAPSULEROOT/notes" && v "$CAPSULEROOT/notes/$(date +"%Y_%m_%d").md"'
#function mv_confirm {
#    if [[ -f "$([[ -d $2 ]] && echo "$2/$(basename $1)" || echo "$2")" ]]; then
#        echo Destination Exists!
#        return 1
#    else
#        mv $1 $2
#    fi
#}
alias mv='mv -i'
alias ls='lsd'
alias du='echo use dust'
alias df='echo use duf'
#alias rm='echo use rip'
alias f='fuck'
alias ping='gping'
eval "$(zoxide init zsh --cmd c)"
#    vim tmux integration
#        that moment when you forget what's vim and what's tmux
alias :q='tmux kill-pane'
alias :qa='tmux kill-window'
#    editing
#alias nvim='neovide' # :sun: :glasses: # :( capslock->control doesn't work
# alias nvim='e' # emacs gang # TODO: iosevka, folds, 4 space indent, don't overwrite system clipboard
alias vim='nvim'
alias v=nvim
alias note='nvim -u $XDG_CONFIG_HOME/nvim/notesmode.vim'
#alias v='neovide --frameless --multiGrid'
#function v {
#    neovide --frameless --multiGrid $@ &
#    disown %neovide
#}
alias findpass=' pass show -c $(find "$HOME/.password-store" -name "*.gpg" -exec grealpath --relative-to "$HOME/.password-store" {} \; | rev | cut -c5- | rev | fzf)'
alias compile_org_to_pdf='pandoc -s *.org -o export.pdf --pdf-engine=xelatex --lua-filter=$HOME/.pandoc/filters/org_directives_to_metadata.lua && mupdf export.pdf'
#    git
alias gpl='git pull'
function gtfa {
	git branch -r | grep -v '\->' | sed "s,\x1B\[[0-9;]*[a-zA-Z],,g" | while read remote; do git branch --track "${remote#origin/}" "$remote"; done
	git fetch --all
	git pull --all
}
function gpext {
    nohup git push "$@" > /dev/null &
}
alias gp='gpext'
alias grsh='git remote show'
function gutil {
    if [[ -z "$(git status --porcelain .)" ]] then
	echo "Nothing to add... commit anyways?"
	read -t 1
    fi
    gpl
    git add ${1:-"."} &&\
    git commit -v --allow-empty
    gp
}
alias gg='gutil'
alias GG='gutil -A'
#    julia
alias jl="julia -O0 --compile=min --startup=no" # run julia w/o optimizations for fast dev time, https://www.reddit.com/r/Julia/comments/lmznx7/comment/gnyyv7u/?utm_source=share&utm_medium=web2x&context=3
#    python stuff
alias py='python'
alias pip='py -m pip'
alias pym='py -m'
alias venv='source .venv/bin/activate || pym venv .venv && echo .venv/ >> .gitignore && source .venv/bin/activate'
alias ipy='ipython'
alias cic='conda install -c conda-forge'
alias ca='conda activate'
#    screen stuff
alias sl='screen -ls'
alias ss='screen -S '
alias s='trf'
#    tmuxinator
alias mux='tmuxinator'

#    toggl
alias tl='pym toggl'
alias t='pit2ya_crt' # github.com/exr0nprojects/pit2ya
alias tt='t && slep'
alias pt='pit2ya_mod'
#alias t='tl continue "$(tl -s ls -f description | tail -n +2 | fzf)"'
#alias tg='tl ls -f id,description,start,duration | tail -n +2 | fzf | cut -d" " -f 2'
#alias  t='tl continue "$(tl ls -f description | tail -n +2 | fzf)"'
#alias  t='tl continue ${"$(tl ls -f description | tail -n +2 | fzf)": 1}'

track_pool() {
    if [[ -z $1 ]]; then
        echo "Empty shot count! abort."
    else
        echo $(date -Is),$1 >> $HOME/org/autotrack/8ball_pool.csv
        pit2ya_mod 'Curiosity - 8ball Pool Practice'
        pit2ya_crt 'Transition'
    fi
}

alias sus='systemctl suspend'
alias slep='xset dpms force off'
if [[ `uname` != "Darwin" ]]; then
    alias pbcopy='xsel --clipboard --input'
    alias ss='import png:- | xclip -selection c -t image/png' # https://bbs.archlinux.org/viewtopic.php?id=163312
    alias pbpaste='xsel --clipboard --output'
    alias yay='yay --noremovemake'
    alias vidya='pkill xcape && xcape -e "Caps_Lock=Caps_Lock" && ~/Applications/Lunar*.AppImage && pkill xcape && xcape -e "Caps_Lock=Escape"'
    # other bits
    alias ql='mupdf'
fi
alias myip='curl -4 icanhazip.com; curl -6 icanhazip.com'

#   custom alt active
alias aset='alt_active_setvar.zsh'

#    makefile
#alias m='make'
alias make='make -j'
alias bear='SDKROOT=$(xcrun --show-sdk-path) \bear'

#    rust/cargo things
[[ -f $HOME/.cargo/env ]] && source $HOME/.cargo/env
alias cn='cargo new --vcs git'
alias cr='cargo run'

# emaaaacs
# alias emacs='open -a emacs --args $CAPSULEROOT/org/inbox.org'
#alias emacs='open -a emacs --args $CAPSULEROOT/org/inbox.org'

# functions
#    cd to parent directory of file, https://askubuntu.com/a/316632
#function fcd () {
#    if [[ -n "$1" ]]; then
#    if [[ -f "$1" ]]; then
#        \cd "$(dirname "$1")"
#    else
#        \cd "$1"
#    fi
#    else
#    \cd $HOME
#    fi
#}
#alias c='fcd'
alias ..='"$(dirname "$(pwd)")"'

function chpwd () {	# auto called by zsh
    echo "$(date '+%Y,%m,%d,%H,%M,%S'),$(pwd)" >> $XDG_DATA_HOME/recent_dirs.csv
    #git rev-parse --show-toplevel > /dev/null 2>&1 &&
	echo "$(pwd)" >> $XDG_DATA_HOME/recent_git_dirs.csv

	cur="$(pwd)"

	# auto-env switching, removed because slow
	# if command -v deactivate; then deactivate; fi
	# while [[ -n $cur && $cur != "/" ]]; do   # search upwards https://unix.stackexchange.com/a/35265
	# 	[[ -f "$cur/pyvenv.cfg" ]] && source "$cur/bin/activate" && break
	# 	[[ -f "$cur/.venv/pyvenv.cfg" ]] && source "$cur/.venv/bin/activate" && break

	# 	# Note: if you want to ignore symlinks, use "$(realpath -s "$path"/..)"
    #     if [[ `uname` != "Darwin" ]]; then
    #         cur="$(readlink -f "$cur"/..)"
    #     else
    #         cur="$(greadlink -f "$cur"/..)"
    #     fi
	# done
}

function run_generic () {
    files="$(ls 2>/dev/null)"
    # build systems
    if   echo $files | ag '^start\.z?sh$' > /dev/null; then	    # start.sh
	source start.*sh
    elif echo $files | ag '^[Mm]akefile$' > /dev/null; then	    # makefile
	make
    elif echo $files | ag '^yarn\.lock$' > /dev/null; then		    # yarn
	yarn && yarn run
    # standard entry point file names
    else
        TEMP_RUN_HEADER="$(date)\n$(printf "%*s\n" "${COLUMNS:-$(tput cols)}" '' | tr " " "#")"
        if echo $files | ag '^main.*\.cpp$' > /dev/null; then		# cpp
            clang++ -std=c++11 main*.cpp -o auto 				&&\
            echo $TEMP_RUN_HEADER && ./auto 				&&\
            setopt +o nomatch && cat *.out 2>/dev/null
        # TODO: dry up following ifs
        elif echo $files | ag '^main\.py$' > /dev/null; then		# python
            echo $TEMP_RUN_HEADER && py main.py
        elif echo $files | ag '^index\.js$' > /dev/null; then		# node index.js
            if echo $files | ag '^package(-lock)?\.json$' > /dev/null; then
                npm install
            fi
            echo $TEMP_RUN_HEADER && node index.js
        elif echo $files | ag '^main\.js$' > /dev/null; then       # node main.js
            echo $TEMP_RUN_HEADER && node main.js
        fi
    fi
}
alias m='run_generic'

#export FZF_CTRL_T_COMMAND='command find -L $([[ "${PWD##$HOME}" != "${PWD}" ]] && echo "$HOME" || echo "$PWD") -mindepth 1 \\( -path '"'"'*/\\.*'"'"' -o -fstype '"'"'sysfs'"'"' -o -fstype '"'"'devfs'"'"' -o -fstype '"'"'devtmpfs'"'"' -o -fstype '"'"'proc'"'"' \\) -prune \
#    -o -type f -print \
#    -o -type d -print \
#    -o -type l -print 2> /dev/null | cut -b1-'
#export FZF_CTRL_T_COMMAND='find -L $([[ "${PWD##$HOME}" != "${PWD}" ]] && echo "$HOME" || echo "$PWD") -mindepth 1 \\( -path '"'"'*/\\.*'"'"' -o -fstype '"'"'sysfs'"'"' -o -fstype '"'"'devfs'"'"' -o -fstype '"'"'devtmpfs'"'"' -o -fstype '"'"'proc'"'"' \\) -prune \
#    -o -type f -print \
#    -o -type d -print \
#    -o -type l -print 2> /dev/null | cut -b1-'
#export FZF_CTRL_T_COMMAND='hypertrav $([[ "${PWD##$HOME}" != "${PWD}" ]] && echo "$HOME" || echo "$PWD")'
#export FZF_DEFAULT_COMMAND='hypertrav'

#    Alias to auto open files with vim (suffix aliases)
alias -s {txt,md,cpp,py,properties,yml,yaml}=nvim
alias -s {pdf,html}=ql
alias -s {aloh}=note

#    One off aliases (like config commands)
alias ok='alerter -message hi -timeout 3 -appIcon https://i.imgur.com/1lKcbkC.png'
#hidutil property --set "$($ZSH_CUSTOM/keymap_util/map)" > /dev/null # Replaced by Karabiner
defaults write -g KeyRepeat -int 1 # https://apple.stackexchange.com/a/83923
defaults write -g ApplePressAndHoldEnabled -bool false # turn off accentecd characters: https://www.addictivetips.com/mac-os/disable-accented-characters-on-macos/
#defaults write com.apple.dock autohide-delay -float 2; killall Dock  # set dock show delay to 2 seconds


cd "$(tail -n 1 $XDG_DATA_HOME/recent_dirs.csv | cut -d ',' -f7)"
