// Imported first by tests whose cases are written against a fixed local
// timezone. The app timezone is read once at module load, so this must run
// before any module that imports app-timezone.
process.env.APP_TIMEZONE = 'Europe/Stockholm'
