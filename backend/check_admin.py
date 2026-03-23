from api.index import create_app
from auth import verify_admin

app = create_app()

with app.app_context():
    admin = verify_admin("admin", "admin123")
    print("admin ok", bool(admin), getattr(admin, "username", None))
