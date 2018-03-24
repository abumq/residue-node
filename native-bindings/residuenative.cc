#include <nan.h>
#include <residue/residue.h>

using v8::FunctionTemplate;
using v8::Handle;
using v8::Object;
using v8::String;
using Nan::To;
using Nan::GetFunction;
using Nan::New;
using Nan::Set;

NAN_METHOD(Version) {
    NanScope();
    NanReturnValue(String::New(Residue::version()));
}

NAN_METHOD(Connect) {
    v8::String::Utf8Value jsonParam(info[0]->ToString());
    std::string json(*jsonParam);
    Residue::loadConfigurationFromJson(json);
    Residue::reconnect();
}

NAN_MODULE_INIT(InitAll) {
    Set(target, New<String>("version").ToLocalChecked(),
        GetFunction(New<FunctionTemplate>(Version)).ToLocalChecked());

    Set(target, New<String>("connect").ToLocalChecked(),
        GetFunction(New<FunctionTemplate>(Connect)).ToLocalChecked());
}

NODE_MODULE(residuenative, InitAll)
