// apps/web/src/lib/i18n.js — admin UI translations
// Only covers admin UI strings; the gallery viewer is localised at build time by the engine.

export const translations = {
  en: {
    // Nav / auth
    sign_out: 'Sign out',
    settings: 'Settings',
    back_to_galleries: '← Galleries',
    loading: 'Loading…',
    cancel: 'Cancel',
    save: 'Save',
    saving: 'Saving…',
    create: 'Create',
    delete: 'Delete',
    confirm_delete: 'Delete this gallery? This cannot be undone.',
    error: 'Error',

    // Dashboard
    galleries: 'Galleries',
    new_gallery: '+ New gallery',
    gallery_title_placeholder: 'Gallery title',
    no_galleries: 'No galleries yet.',
    create_first_gallery: 'Create your first gallery',
    size: '{size}',
    photos_count: '{n} photo',
    photos_count_plural: '{n} photos',

    // Gallery card badges
    status_done: 'done',
    status_updated: 'updated',
    status_building: 'building',
    status_error: 'error',
    status_draft: 'draft',
    status_queued: 'queued',
    status_pending: 'pending',

    // Gallery card actions
    view_gallery: 'View ↗',
    build_action: 'Build',
    already_published: 'Already up to date',

    // Gallery indicators
    private_indicator: 'Private',
    password_indicator: 'Password',

    // Gallery detail — header
    view_gallery_btn: 'View gallery ↗',
    build_btn: '▶ Build',
    force_rebuild_btn: '↺ Force rebuild',

    // Gallery detail — tabs
    tab_photos: 'Photos',
    tab_settings: 'Settings',
    tab_jobs: 'Jobs',

    // Gallery detail — photos tab
    upload_photos: 'Upload photos',
    photos_changed_banner: 'Photos have changed since the last build —',
    build_now: 'Build now',
    no_photos: 'No photos yet.',
    photos_list_title: 'Photos ({n})',

    // Gallery detail — settings tab
    field_title: 'Title',
    field_subtitle: 'Subtitle',
    field_description: 'Description',
    field_author: 'Author',
    field_author_email: 'Author email',
    save_settings: 'Save settings',
    settings_saved: 'Settings saved',
    advanced_settings: 'Advanced settings',
    field_date: 'Date',
    field_location: 'Location',
    field_locale: 'Language',
    field_access: 'Access',
    field_password: 'Password',
    field_cover_photo: 'Cover photo',
    field_allow_dl_image: 'Allow image download',
    field_allow_dl_gallery: 'Allow gallery download (ZIP)',
    field_private: 'Private (hidden URL)',
    upload_photos_first: 'Upload photos first.',
    auto_from_exif: 'Auto from EXIF:',

    // Gallery detail — danger zone
    danger_zone: 'Danger zone',
    rename_slug: 'Gallery URL name',
    rename_slug_hint: 'Changing this renames the folder on disk and breaks existing links.',
    rename_slug_btn: 'Rename',
    delete_gallery_btn: 'Delete gallery',
    delete_gallery_confirm: 'Delete this gallery from the admin? Built files are kept on disk.',

    // Jobs tab
    recent_builds: 'Recent builds',
    no_builds: 'No builds yet.',

    // Dashboard filters
    filter_all: 'All',
    filter_private: 'Private',
    filter_password: 'Password',
    filter_rebuild: 'To rebuild',
    public_site: 'Public site ↗',

    // Access management panel
    tab_access: 'Access',
    access_panel_title: 'Access management',
    access_members_title: 'Gallery members',
    access_tokens_title: 'Viewer tokens',
    access_invite_title: 'Invite to studio',
    access_no_members: 'No gallery-level members.',
    access_no_tokens: 'No viewer tokens yet.',
    access_role_viewer: 'viewer',
    access_role_contributor: 'contributor',
    access_role_editor: 'editor',
    access_role_photographer: 'photographer',
    access_role_admin: 'admin',
    access_remove: 'Remove',
    access_revoke: 'Revoke',
    access_copy_link: 'Copy link',
    access_copied: 'Copied!',
    access_token_label_placeholder: 'Label (optional)',
    access_token_expiry_label: 'Expires',
    access_create_token: 'Create token',
    access_invite_email_placeholder: 'Email address',
    access_send_invite: 'Send invitation',
    access_invite_sent: 'Invitation created',
    access_invite_link_hint: 'Share this link (email not sent yet):',
    access_unnamed_token: 'Unnamed',
    access_expires: 'Expires {date}',

    // Global settings
    global_settings: 'Global settings',
    section_site: 'Site',
    field_site_title: 'Site title',
    site_title_hint: 'Used as the main title in the public gallery listing and the admin header.',
    section_photographer: 'Default photographer',
    field_author_name: 'Author name',
    section_gallery_defaults: 'Default gallery settings',
    field_language: 'Language',
    field_access_default: 'Access',
    field_allow_dl_image_default: 'Allow image download',
    field_allow_dl_gallery_default: 'Allow gallery download (ZIP)',
    field_private_default: 'Private (hidden URL)',
    save_settings_btn: 'Save settings',
  },

  fr: {
    sign_out: 'Se déconnecter',
    settings: 'Paramètres',
    back_to_galleries: '← Galeries',
    loading: 'Chargement…',
    cancel: 'Annuler',
    save: 'Enregistrer',
    saving: 'Enregistrement…',
    create: 'Créer',
    delete: 'Supprimer',
    confirm_delete: 'Supprimer cette galerie ? Cette action est irréversible.',
    error: 'Erreur',

    galleries: 'Galeries',
    new_gallery: '+ Nouvelle galerie',
    gallery_title_placeholder: 'Titre de la galerie',
    no_galleries: 'Aucune galerie.',
    create_first_gallery: 'Créer votre première galerie',
    size: '{size}',
    photos_count: '{n} photo',
    photos_count_plural: '{n} photos',

    status_done: 'publié',
    status_updated: 'modifié',
    status_building: 'compilation',
    status_error: 'erreur',
    status_draft: 'brouillon',
    status_queued: 'en attente',
    status_pending: 'en attente',

    view_gallery: 'Voir ↗',
    build_action: 'Compiler',
    already_published: 'Déjà à jour',

    private_indicator: 'Privée',
    password_indicator: 'Mdp',

    view_gallery_btn: 'Voir la galerie ↗',
    build_btn: '▶ Compiler',
    force_rebuild_btn: '↺ Recompiler',

    tab_photos: 'Photos',
    tab_settings: 'Paramètres',
    tab_jobs: 'Compilations',

    upload_photos: 'Ajouter des photos',
    photos_changed_banner: 'Les photos ont changé depuis la dernière compilation —',
    build_now: 'Compiler maintenant',
    no_photos: 'Aucune photo.',
    photos_list_title: 'Photos ({n})',

    field_title: 'Titre',
    field_subtitle: 'Sous-titre',
    field_description: 'Description',
    field_author: 'Auteur',
    field_author_email: 'Email auteur',
    save_settings: 'Enregistrer',
    settings_saved: 'Paramètres enregistrés',
    advanced_settings: 'Paramètres avancés',
    field_date: 'Date',
    field_location: 'Lieu',
    field_locale: 'Langue',
    field_access: 'Accès',
    field_password: 'Mot de passe',
    field_cover_photo: 'Photo de couverture',
    field_allow_dl_image: 'Téléchargement photo',
    field_allow_dl_gallery: 'Téléchargement galerie (ZIP)',
    field_private: 'Privée (URL cachée)',
    upload_photos_first: 'Ajoutez des photos d\'abord.',
    auto_from_exif: 'Auto EXIF :',

    danger_zone: 'Zone de danger',
    rename_slug: 'Nom dans l\'URL',
    rename_slug_hint: 'Modifier ceci renomme le dossier sur disque et casse les liens existants.',
    rename_slug_btn: 'Renommer',
    delete_gallery_btn: 'Supprimer la galerie',
    delete_gallery_confirm: 'Supprimer cette galerie de l\'admin ? Les fichiers compilés sont conservés.',

    recent_builds: 'Compilations récentes',
    no_builds: 'Aucune compilation.',

    filter_all: 'Tout',
    filter_private: 'Privées',
    filter_password: 'Mot de passe',
    filter_rebuild: 'À recompiler',
    public_site: 'Site public ↗',

    // Access management panel
    tab_access: 'Accès',
    access_panel_title: 'Gestion des accès',
    access_members_title: 'Membres de la galerie',
    access_tokens_title: 'Liens de partage',
    access_invite_title: 'Inviter dans le studio',
    access_no_members: 'Aucun membre spécifique à cette galerie.',
    access_no_tokens: 'Aucun lien de partage.',
    access_role_viewer: 'lecteur',
    access_role_contributor: 'contributeur',
    access_role_editor: 'éditeur',
    access_role_photographer: 'photographe',
    access_role_admin: 'admin',
    access_remove: 'Retirer',
    access_revoke: 'Révoquer',
    access_copy_link: 'Copier le lien',
    access_copied: 'Copié !',
    access_token_label_placeholder: 'Libellé (facultatif)',
    access_token_expiry_label: 'Expiration',
    access_create_token: 'Créer un lien',
    access_invite_email_placeholder: 'Adresse e-mail',
    access_send_invite: 'Envoyer l\'invitation',
    access_invite_sent: 'Invitation créée',
    access_invite_link_hint: 'Partagez ce lien (e-mail non envoyé) :',
    access_unnamed_token: 'Sans nom',
    access_expires: 'Expire le {date}',

    global_settings: 'Paramètres globaux',
    section_site: 'Site',
    field_site_title: 'Titre du site',
    site_title_hint: 'Utilisé comme titre principal dans la liste publique et l\'interface d\'administration.',
    section_photographer: 'Photographe par défaut',
    field_author_name: 'Nom de l\'auteur',
    section_gallery_defaults: 'Paramètres par défaut',
    field_language: 'Langue',
    field_access_default: 'Accès',
    field_allow_dl_image_default: 'Téléchargement photo',
    field_allow_dl_gallery_default: 'Téléchargement galerie (ZIP)',
    field_private_default: 'Privée (URL cachée)',
    save_settings_btn: 'Enregistrer les paramètres',
  },

  de: {
    sign_out: 'Abmelden',
    settings: 'Einstellungen',
    back_to_galleries: '← Galerien',
    loading: 'Laden…',
    cancel: 'Abbrechen',
    save: 'Speichern',
    saving: 'Speichern…',
    create: 'Erstellen',
    delete: 'Löschen',
    confirm_delete: 'Diese Galerie löschen? Dies kann nicht rückgängig gemacht werden.',
    error: 'Fehler',
    galleries: 'Galerien',
    new_gallery: '+ Neue Galerie',
    gallery_title_placeholder: 'Galerie-Titel',
    no_galleries: 'Noch keine Galerien.',
    create_first_gallery: 'Erste Galerie erstellen',
    size: '{size}',
    photos_count: '{n} Foto',
    photos_count_plural: '{n} Fotos',
    status_done: 'veröffentlicht',
    status_updated: 'aktualisiert',
    status_building: 'wird erstellt',
    status_error: 'Fehler',
    status_draft: 'Entwurf',
    status_queued: 'in Warteschlange',
    status_pending: 'ausstehend',
    view_gallery: 'Ansehen ↗',
    build_action: 'Erstellen',
    already_published: 'Bereits aktuell',
    private_indicator: 'Privat',
    password_indicator: 'Passwort',
    view_gallery_btn: 'Galerie ansehen ↗',
    build_btn: '▶ Erstellen',
    force_rebuild_btn: '↺ Neu erstellen',
    tab_photos: 'Fotos',
    tab_settings: 'Einstellungen',
    tab_jobs: 'Aufträge',
    upload_photos: 'Fotos hochladen',
    photos_changed_banner: 'Fotos haben sich seit dem letzten Build geändert —',
    build_now: 'Jetzt erstellen',
    no_photos: 'Noch keine Fotos.',
    photos_list_title: 'Fotos ({n})',
    field_title: 'Titel',
    field_subtitle: 'Untertitel',
    field_description: 'Beschreibung',
    field_author: 'Autor',
    field_author_email: 'Autor-E-Mail',
    save_settings: 'Einstellungen speichern',
    settings_saved: 'Einstellungen gespeichert',
    advanced_settings: 'Erweiterte Einstellungen',
    field_date: 'Datum',
    field_location: 'Ort',
    field_locale: 'Sprache',
    field_access: 'Zugang',
    field_password: 'Passwort',
    field_cover_photo: 'Titelfoto',
    field_allow_dl_image: 'Foto-Download',
    field_allow_dl_gallery: 'Galerie-Download (ZIP)',
    field_private: 'Privat (versteckte URL)',
    upload_photos_first: 'Zuerst Fotos hochladen.',
    auto_from_exif: 'Auto aus EXIF:',
    danger_zone: 'Gefahrenzone',
    rename_slug: 'URL-Name',
    rename_slug_hint: 'Ändert den Ordnernamen und bricht bestehende Links.',
    rename_slug_btn: 'Umbenennen',
    delete_gallery_btn: 'Galerie löschen',
    delete_gallery_confirm: 'Diese Galerie aus dem Admin löschen? Erstellte Dateien bleiben erhalten.',
    recent_builds: 'Letzte Builds',
    no_builds: 'Noch keine Builds.',
    // Access management panel
    tab_access: 'Zugang',
    access_panel_title: 'Zugriffsverwaltung',
    access_members_title: 'Galerie-Mitglieder',
    access_tokens_title: 'Betrachter-Links',
    access_invite_title: 'Ins Studio einladen',
    access_no_members: 'Keine galeriespezifischen Mitglieder.',
    access_no_tokens: 'Noch keine Betrachter-Links.',
    access_role_viewer: 'Betrachter',
    access_role_contributor: 'Mitwirkender',
    access_role_editor: 'Redakteur',
    access_role_photographer: 'Fotograf',
    access_role_admin: 'Admin',
    access_remove: 'Entfernen',
    access_revoke: 'Widerrufen',
    access_copy_link: 'Link kopieren',
    access_copied: 'Kopiert!',
    access_token_label_placeholder: 'Bezeichnung (optional)',
    access_token_expiry_label: 'Ablaufdatum',
    access_create_token: 'Link erstellen',
    access_invite_email_placeholder: 'E-Mail-Adresse',
    access_send_invite: 'Einladung senden',
    access_invite_sent: 'Einladung erstellt',
    access_invite_link_hint: 'Teilen Sie diesen Link (E-Mail wird nicht gesendet):',
    access_unnamed_token: 'Ohne Namen',
    access_expires: 'Läuft ab am {date}',

    global_settings: 'Globale Einstellungen',
    section_site: 'Website',
    field_site_title: 'Website-Titel',
    site_title_hint: 'Wird als Haupttitel in der öffentlichen Galerieliste und im Admin-Header verwendet.',
    section_photographer: 'Standard-Fotograf',
    field_author_name: 'Autorenname',
    section_gallery_defaults: 'Standard-Galerieeinstellungen',
    field_language: 'Sprache',
    field_access_default: 'Zugang',
    field_allow_dl_image_default: 'Foto-Download',
    field_allow_dl_gallery_default: 'Galerie-Download (ZIP)',
    field_private_default: 'Privat (versteckte URL)',
    save_settings_btn: 'Einstellungen speichern',
    filter_all: 'Alle',
    filter_private: 'Privat',
    filter_password: 'Passwort',
    filter_rebuild: 'Neu erstellen',
    public_site: 'Öffentliche Website ↗',
  },
};

/**
 * Create a translator function for a given locale.
 * Falls back to 'en' for any missing key.
 */
export function createTranslator(locale) {
  const lang = translations[locale] || translations.en;
  return function t(key, vars = {}) {
    let str = lang[key] ?? translations.en[key] ?? key;
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(`{${k}}`, String(v));
    }
    return str;
  };
}

/** Convert a human-readable title to a URL slug. */
export function slugify(title) {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9]+/g, '-')     // non-alphanumeric → dash
    .replace(/^-+|-+$/g, '')         // trim leading/trailing dashes
    || 'gallery';
}

/** Format bytes to human-readable size. */
export function formatSize(bytes) {
  if (!bytes || bytes === 0) return null;
  if (bytes < 1024)       return bytes + ' B';
  if (bytes < 1048576)    return Math.round(bytes / 1024) + ' KB';
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1073741824).toFixed(2) + ' GB';
}
