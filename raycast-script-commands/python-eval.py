#!/usr/bin/env python3

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Python Eval
# @raycast.mode compact

# Optional parameters:
# @raycast.icon 🤖

# Documentation:
# @raycast.description Run a python expression
# @raycast.author exr0n
# @raycast.authorURL https://raycast.com/exr0n

# @raycast.argument1 { "type": "text", "placeholder": "Python Expression", "percentEncoded": false }

import sys
print(eval(sys.argv[1]))

