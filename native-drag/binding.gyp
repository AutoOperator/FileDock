{
  "targets": [
    {
      "target_name": "native_drag",
      "sources": [ "src/native-drag.cc" ],
      "defines": [ "UNICODE", "_UNICODE" ],
      "msvs_settings": {
        "VCCLCompilerTool": { "ExceptionHandling": 1, "RuntimeLibrary": 2 }
      }
    }
  ]
}
