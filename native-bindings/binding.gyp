{
  "targets": [
    {
      "target_name": "residue_native",
      "sources": [
        "residue_native.cc"
      ],
      "libraries": [ "/usr/local/lib/libresidue-static.a" ],
      "include_dirs": ["<!(node -e \"require('nan')\")"]
    }
  ]
}
