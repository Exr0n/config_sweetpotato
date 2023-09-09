hs.hotkey.bind({"cmd", "alt", "ctrl"}, "r", function()
  hs.reload()
end)

function dump(o) -- https://stackoverflow.com/questions/9168058/how-to-dump-a-table-to-console
  if type(o) == 'table' then
     local s = '{ '
     for k,v in pairs(o) do
        if type(k) ~= 'number' then k = '"'..k..'"' end
        s = s .. '['..k..'] = ' .. dump(v) .. ','
     end
     return s .. '} '
  else
     return tostring(o)
  end
end

function keys(o)
  if type(o) == 'table' then
    local s = '{ '
    for k,v in pairs(o) do
      if type(k) ~= 'number' then k = '"'..k..'"' end -- add quotes to numeric keys
      s = s ..'['..k..'], '
    end
    return s .. '} '
  else
    return tostring(o)
  end
end

burrows_clipboard_watcher = hs.pasteboard.watcher.new(function ()
  print("clipboard clipped!")
  print(hs.pasteboard.getContents())
  print(dump(hs.pasteboard.pasteboardTypes()))
  print(keys(hs.pasteboard.readAllData()))
end)
-- print("is it running?", burrows_clipboard_watcher:running())