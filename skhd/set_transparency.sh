#!/bin/bash

TRANSPARENT=0.7

###############################

CUR_OPACITY=$(yabai -m query --windows --window | jq '.opacity')

#if [ $CUR_OPACITY -eq 1 ]; then
if [ `echo "$CUR_OPACITY == 1.0" | bc` -eq 1 ]; then
    yabai -m window --opacity $TRANSPARENT
elif [ `echo "$CUR_OPACITY == $TRANSPARENT" | bc` -eq 1 ]; then
    yabai -m window --opacity 0.999
else
    yabai -m window --opacity 0.0
fi