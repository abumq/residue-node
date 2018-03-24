{
  "targets": [
    {
      "target_name": "residuenative",
      "sources": [
        "residuenative.cc"
      ],
      "libraries": [ "/usr/local/lib/libresidue-static.a" ],
      "include_dirs": ["<!(node -e \"require('nan')\")"]
    }
  ]
}
