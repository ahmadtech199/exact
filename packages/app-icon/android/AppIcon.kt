// @exact/app-icon on Android. Android has no alternate icons; the launcher shows an entry per enabled launcher
// activity, so the build moves the shell activity's launcher entry to the alias `dev.exact.app.ExactIcon`, and adds
// one disabled alias `dev.exact.app.ExactIcon<Name>` per icon app.json names, each with its own `android:icon`.
// Choosing an icon enables its alias and disables the rest (`PackageManager.setComponentEnabledSetting`). Disabling
// the launcher entry the app's task came from closes the task, DONT_KILL_APP or not, so the choice is kept and applied
// when the person leaves the app (the activity stops other than for a configuration change); the status answers the
// chosen icon from the moment it is chosen. The launcher then redraws its entry, and drops home-screen shortcuts of the
// old alias. `icon` is "" for the primary icon.
package exact.appicon

import android.app.Activity
import android.app.Application
import android.content.ComponentName
import android.content.Context
import android.content.pm.ActivityInfo
import android.content.pm.PackageManager
import android.os.Bundle
import dev.exact.canvas.ExactExtension
import dev.exact.canvas.ExtensionContext
import org.json.JSONObject

class AppIconModule(context: ExtensionContext) : ExactExtension(context) {
    private val prefix = "dev.exact.app.ExactIcon"
    private val prefs by lazy { context.application.getSharedPreferences("exact.app-icon", Context.MODE_PRIVATE) }
    private var watching = false

    override fun later(name: String, args: JSONObject, reply: (JSONObject) -> Unit) {
        when (name) {
            "appIconStatus" -> reply(status())
            "setAppIcon" -> reply(choose(args.optString("icon")))
            else -> reply(JSONObject().put("error", "NotSupportedError"))
        }
    }

    private val pm get() = context.application.packageManager

    /** Every alias the build declared, enabled or not, by icon name ("" for the primary icon's). */
    private fun aliases(): Map<String, ActivityInfo> {
        val app = context.application
        @Suppress("DEPRECATION")
        val info = pm.getPackageInfo(app.packageName, PackageManager.GET_ACTIVITIES or PackageManager.MATCH_DISABLED_COMPONENTS)
        return info.activities.orEmpty().filter { it.name.startsWith(prefix) }.associateBy { it.name.removePrefix(prefix) }
    }

    private fun enabled(info: ActivityInfo): Boolean = when (pm.getComponentEnabledSetting(ComponentName(info.packageName, info.name))) {
        PackageManager.COMPONENT_ENABLED_STATE_ENABLED -> true
        PackageManager.COMPONENT_ENABLED_STATE_DEFAULT -> info.enabled
        else -> false
    }

    private fun pending(): String? = if (prefs.contains("pending")) prefs.getString("pending", "") else null

    private fun status(): JSONObject {
        val aliases = aliases()
        if (aliases.size < 2) return JSONObject().put("available", false).put("icon", "")
        val shown = pending()?.takeIf { it in aliases } ?: aliases.entries.firstOrNull { enabled(it.value) }?.key ?: ""
        if (pending() != null) watch()
        return JSONObject().put("available", true).put("icon", shown)
    }

    private fun choose(icon: String): JSONObject {
        val aliases = aliases()
        if (icon !in aliases) return status().also { context.log("setAppIcon: no icon named \"$icon\"") }
        prefs.edit().putString("pending", icon).apply()
        watch()
        context.log("setAppIcon: ${icon.ifEmpty { "the primary icon" }}, applied when the app leaves the screen")
        return JSONObject().put("available", true).put("icon", icon)
    }

    private fun watch() {
        if (watching) return
        watching = true
        (context.application.applicationContext as Application).registerActivityLifecycleCallbacks(object : Application.ActivityLifecycleCallbacks {
            override fun onActivityStopped(activity: Activity) { if (!activity.isChangingConfigurations) apply() }
            override fun onActivityCreated(activity: Activity, state: Bundle?) {}
            override fun onActivityStarted(activity: Activity) {}
            override fun onActivityResumed(activity: Activity) {}
            override fun onActivityPaused(activity: Activity) {}
            override fun onActivitySaveInstanceState(activity: Activity, state: Bundle) {}
            override fun onActivityDestroyed(activity: Activity) {}
        })
    }

    private fun apply() {
        val icon = pending() ?: return
        prefs.edit().remove("pending").apply()
        val aliases = aliases()
        val target = aliases[icon] ?: return
        // The new entry first, so the package never has no launcher entry.
        pm.setComponentEnabledSetting(ComponentName(target.packageName, target.name), PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP)
        for ((name, info) in aliases) if (name != icon && enabled(info)) {
            pm.setComponentEnabledSetting(ComponentName(info.packageName, info.name), PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP)
        }
    }
}
