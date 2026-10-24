// Every word the key video shows, French and English. Google's and AI Studio's are theirs, read from the live pages on
// 2026-10-19 (docs/KEY-VIDEO.md); the French of the list, the two dialogs and the key's details are guesses until a
// French screenshot comes. tcf.monster's are the app's own.
export const WORDS = {
  fr: {
    newTab: "Nouvel onglet", ntp: "Rechercher sur Google ou saisir une URL", go: "Aller",
    tabGoogle: "Connexion : comptes Google", tabStudio: "API keys | Google AI Studio",
    signIn: "Connexion", useAccount: "Utilisez votre compte Google", emailLabel: "Adresse e-mail ou téléphone", forgotEmail: "Adresse e-mail oubliée ?",
    guest: "Ce n'est pas votre ordinateur ? Utilisez le mode Invité pour vous connecter en mode privé.", guestLink: "En savoir plus sur l'utilisation du mode Invité",
    create: "Créer un compte", next: "Suivant", welcome: "Bienvenue", pwLabel: "Saisissez votre mot de passe", showPw: "Afficher le mot de passe", forgotPw: "Mot de passe oublié ?",
    lang: "Français (France)", help: "Aide", privacy: "Confidentialité", terms: "Conditions",
    project: "Projet", keys: "Clés API", projects: "Projets", usageBilling: "Utilisation et facturation", usage: "Utilisation", rate: "Limite de débit", spend: "Dépenses",
    billing: "Facturation", observe: "Observer", logs: "Journaux et ensembles de données", changelog: "Journal des modifications",
    quick: "Guide de démarrage rapide des API", createKey: "Créer une clé API", groupBy: "Grouper par", byKey: "Clé API", byProject: "Projet", filterBy: "Filtrer par", allProjects: "Tous les projets",
    colKey: "Clé", colProject: "Projet", colCreated: "Date de création", colBilling: "Niveau de facturation", setBilling: "Configurer la facturation", freeTier: "Niveau sans frais",
    projectId: "ID du projet", created: "19 oct. 2026",
    dlgTitle: "Créer une clé", nameKey: "Nommer votre clé", chooseProject: "Choisir un projet importé", cancel: "Annuler", createBtn: "Créer une clé",
    detailsTitle: "Détails de la clé API", detailsNote: "Pour en savoir plus sur l'utilisation des clés d'authentification avec l'API Gemini, consultez notre", detailsLink: "documentation sur les clés API",
    apiKey: "Clé API", name: "Nom", projectName: "Nom du projet", projectNumber: "Numéro du projet", deleteKey: "Supprimer la clé", copyCurl: "Copier le guide cURL", copyKey: "Copier la clé",
    menu: ["Annuler", "Rétablir", "Couper", "Copier", "Coller", "Tout sélectionner"], settings: "Réglages", profile: "Profil", account: "Compte", keySection: "Clé Gemini", deleteAccount: "Supprimer le compte", status: "État", paste: "Coller",
    play: "Lire", pause: "Pause", replay: "Revoir", soundOn: "Activer le son", soundOff: "Couper le son", video: "Vidéo : obtenir une clé Gemini",
  },
  en: {
    newTab: "New Tab", ntp: "Search Google or type a URL", go: "Go",
    tabGoogle: "Sign in – Google Accounts", tabStudio: "API keys | Google AI Studio",
    signIn: "Sign in", useAccount: "Use your Google Account", emailLabel: "Email or phone", forgotEmail: "Forgot email?",
    guest: "Not your computer? Use Guest mode to sign in privately.", guestLink: "Learn more about using Guest mode",
    create: "Create account", next: "Next", welcome: "Welcome", pwLabel: "Enter your password", showPw: "Show password", forgotPw: "Forgot password?",
    lang: "English (United States)", help: "Help", privacy: "Privacy", terms: "Terms",
    project: "Project", keys: "API Keys", projects: "Projects", usageBilling: "Usage & Billing", usage: "Usage", rate: "Rate Limit", spend: "Spend",
    billing: "Billing", observe: "Observe", logs: "Logs and Datasets", changelog: "Changelog",
    quick: "API quickstart", createKey: "Create API key", groupBy: "Group by", byKey: "API Key", byProject: "Project", filterBy: "Filter by", allProjects: "All projects",
    colKey: "Key", colProject: "Project", colCreated: "Created", colBilling: "Billing Tier", setBilling: "Set up billing", freeTier: "Free tier",
    projectId: "Project ID", created: "Oct 19, 2026",
    dlgTitle: "Create a new key", nameKey: "Name your key", chooseProject: "Choose an imported project", cancel: "Cancel", createBtn: "Create key",
    detailsTitle: "API key details", detailsNote: "For details on using auth keys with Gemini API, see our", detailsLink: "API key documentation",
    apiKey: "API Key", name: "Name", projectName: "Project name", projectNumber: "Project number", deleteKey: "Delete key", copyCurl: "Copy cURL quickstart", copyKey: "Copy key",
    menu: ["Undo", "Redo", "Cut", "Copy", "Paste", "Select All"], settings: "Settings", profile: "Profile", account: "Account", keySection: "Gemini key", deleteAccount: "Delete account", status: "Status", paste: "Paste",
    play: "Play", pause: "Pause", replay: "Replay", soundOn: "Turn sound on", soundOff: "Turn sound off", video: "Video: getting a Gemini key",
  },
};
export type Words = (typeof WORDS)["fr"];

export const EMAIL = "marie.exemple@gmail.com";
export const KEY = "AQ.Ab8RN6Tq4vLm0xWe2zKc9pYs7uHd3fGj5oBn1rAt";
export const OLD_KEY_END = "7xQe";
export const PROJECT_ID = "gen-lang-client-0427195836";
export const PROJECT_NO = "427195836014";
