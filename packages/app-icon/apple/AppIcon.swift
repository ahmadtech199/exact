// @exact/app-icon on iOS: `UIApplication.setAlternateIconName`, which names one of the app's alternate icon
// sets (an `.appiconset` in its `modules/apple` asset catalog), or nil for the primary icon. iOS then tells the
// person in an alert of its own. `icon` is "" for the primary icon.
import ExactPackage
import Foundation
#if canImport(UIKit)
import UIKit
#endif

public final class AppIconModule: ExactPackage {
    let context: ExactPackageContext

    public init(context: ExactPackageContext) { self.context = context }

    public func later(_ name: String, _ args: [String: Any], preferred: Any?, reply: @escaping ([String: Any]) -> Void) {
        #if canImport(UIKit) && !os(tvOS)
        DispatchQueue.main.async {
            let app = UIApplication.shared
            guard app.supportsAlternateIcons else { return reply(["available": false, "icon": ""]) }
            switch name {
            case "appIconStatus": reply(["available": true, "icon": app.alternateIconName ?? ""])
            case "setAppIcon":
                let icon = args["icon"] as? String ?? ""
                if (app.alternateIconName ?? "") == icon { return reply(["available": true, "icon": icon]) }
                app.setAlternateIconName(icon.isEmpty ? nil : icon) { error in
                    DispatchQueue.main.async {
                        if let error { self.context.log("setAppIcon: \(error.localizedDescription)") }
                        reply(["available": true, "icon": app.alternateIconName ?? ""])
                    }
                }
            default: reply(["error": "NotSupportedError"])
            }
        }
        #else
        reply(name == "appIconStatus" ? ["available": false, "icon": ""] : ["error": "NotSupportedError"])
        #endif
    }

    public func call(_ name: String, _ args: [String: Any]) throws -> [String: Any] {
        ["error": "NotSupportedError"]
    }
}
