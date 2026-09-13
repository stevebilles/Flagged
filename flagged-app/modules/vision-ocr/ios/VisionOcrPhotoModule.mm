#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(VisionOcrPhotoModule, NSObject)

RCT_EXTERN_METHOD(recognize:(NSString *)uri
                  withResolver:(RCTPromiseResolveBlock)resolve
                  withRejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getImageSize:(NSString *)uri
                  withResolver:(RCTPromiseResolveBlock)resolve
                  withRejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(detectDocumentCorners:(NSString *)uri
                  withResolver:(RCTPromiseResolveBlock)resolve
                  withRejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(correctPerspective:(NSString *)uri
                  corners:(NSDictionary *)corners
                  withResolver:(RCTPromiseResolveBlock)resolve
                  withRejecter:(RCTPromiseRejectBlock)reject)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

@end
