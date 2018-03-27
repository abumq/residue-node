{
  "targets": [
    {
      "target_name": "residue-native",
      "sources": [
        "native/residue-native.cc"
      ],
      "libraries": [
        "-lresidue"
      ],
      "defines": [
        "ELPP_THREAD_SAFE",
      ],
      "xcode_settings": {
        "OTHER_CFLAGS": [
          "-fexceptions",
          "-std=c++11",
          "-stdlib=libc++"
        ],
      },
      "include_dirs": [
        "<!(node -e \"require('nan')\")"
      ],
    },
  ],
}
