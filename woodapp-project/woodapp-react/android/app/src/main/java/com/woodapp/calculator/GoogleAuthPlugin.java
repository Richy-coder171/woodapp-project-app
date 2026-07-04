package com.woodapp.calculator;

import android.content.Intent;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.signin.GoogleSignIn;
import com.google.android.gms.auth.api.signin.GoogleSignInAccount;
import com.google.android.gms.auth.api.signin.GoogleSignInClient;
import com.google.android.gms.auth.api.signin.GoogleSignInOptions;
import com.google.android.gms.common.api.ApiException;

@CapacitorPlugin(name = "GoogleAuth")
public class GoogleAuthPlugin extends Plugin {
    @PluginMethod
    public void signIn(PluginCall call) {
        String clientId = call.getString("clientId");

        if (clientId == null || clientId.trim().isEmpty()) {
            call.reject("Google Client ID is missing");
            return;
        }

        GoogleSignInOptions options = new GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestIdToken(clientId)
            .requestEmail()
            .requestProfile()
            .build();

        GoogleSignInClient client = GoogleSignIn.getClient(getActivity(), options);
        client.signOut().addOnCompleteListener(task -> startActivityForResult(call, client.getSignInIntent(), "handleSignInResult"));
    }

    @ActivityCallback
    private void handleSignInResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }

        Intent data = result.getData();

        if (data == null) {
            call.reject("Google sign-in was cancelled");
            return;
        }

        try {
            GoogleSignInAccount account = GoogleSignIn.getSignedInAccountFromIntent(data).getResult(ApiException.class);
            String idToken = account.getIdToken();

            if (idToken == null || idToken.isEmpty()) {
                call.reject("Google did not return an ID token");
                return;
            }

            JSObject ret = new JSObject();
            ret.put("credential", idToken);
            ret.put("email", account.getEmail());
            ret.put("name", account.getDisplayName());
            call.resolve(ret);
        } catch (ApiException ex) {
            call.reject(getGoogleErrorMessage(ex.getStatusCode()));
        }
    }

    private String getGoogleErrorMessage(int statusCode) {
        if (statusCode == 12501) {
            return "Google sign-in was cancelled";
        }

        if (statusCode == 10) {
            return "Google Android OAuth setup is missing. Add an Android OAuth Client in Google Cloud Console for package com.woodapp.calculator with this debug SHA-1: 7D:93:22:DF:55:64:3A:D8:B8:8B:3F:5B:82:B4:8E:9F:29:80:A0:74";
        }

        if (statusCode == 7) {
            return "Google sign-in failed because the phone has no internet connection.";
        }

        return "Google sign-in failed with status code " + statusCode;
    }
}
