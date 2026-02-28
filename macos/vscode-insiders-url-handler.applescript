on open location theURL
    do shell script quoted form of "__NVIM_OPENER_BIN__" & " --uri " & quoted form of theURL
end open location
