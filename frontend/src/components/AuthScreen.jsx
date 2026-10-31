import { useState } from "react";

function AuthScreen({ onAuthenticate, error, isSubmitting }) {
  const [isSignup, setIsSignup] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState("");

  const handleSubmit = (event) => {
    event.preventDefault();
    setFormError("");

    if (isSignup && password !== confirmPassword) {
      setFormError("Passwords do not match.");
      return;
    }

    onAuthenticate(
      isSignup ? "signup" : "login",
      isSignup ? { name, email, password } : { email, password },
    );
  };

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-brand">ansAce</div>
        <h1 id="auth-title">{isSignup ? "Create your account" : "Welcome back"}</h1>
        <p className="auth-description">
          {isSignup
            ? "Sign up to keep your documents private."
            : "Sign in to access your documents and chats."}
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          {isSignup && (
            <>
              <label htmlFor="auth-name">Name</label>
              <input
                id="auth-name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                minLength={1}
                maxLength={120}
              />
            </>
          )}

          <label htmlFor="auth-email">Email</label>
          <input
            id="auth-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            maxLength={254}
          />

          <label htmlFor="auth-password">Password</label>
          <input
            id="auth-password"
            type="password"
            autoComplete={isSignup ? "new-password" : "current-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={isSignup ? 8 : 1}
            maxLength={1024}
          />

          {isSignup && (
            <>
              <label htmlFor="auth-confirm-password">Confirm password</label>
              <input
                id="auth-confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                minLength={8}
                maxLength={1024}
              />
            </>
          )}

          {(formError || error) && (
            <p className="auth-error" role="alert">
              {formError || error}
            </p>
          )}

          <button className="auth-submit" type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? "Please wait..."
              : isSignup
                ? "Create account"
                : "Sign in"}
          </button>
        </form>

        <p className="auth-switch">
          {isSignup ? "Already have an account?" : "New to ansAce?"}{" "}
          <button
            type="button"
            onClick={() => {
              setIsSignup((currentValue) => !currentValue);
              setFormError("");
            }}
          >
            {isSignup ? "Sign in" : "Create an account"}
          </button>
        </p>
      </section>
    </main>
  );
}

export default AuthScreen;
