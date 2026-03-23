from werkzeug.security import check_password_hash, generate_password_hash

from database import db
from models import User, Admin


def create_user(data):
    user = User(
        name=data["name"],
        email=data["email"],
        password=generate_password_hash(data["password"]),
        phone_number=data["phone_number"],
        location=data["location"],
    )
    db.session.add(user)
    db.session.commit()
    return user


def verify_user(email, password):
    user = User.query.filter_by(email=email).first()
    if not user:
        return None
    if check_password_hash(user.password, password):
        return user
    return None


def verify_admin(username, password):
    admin = Admin.query.filter_by(username=username).first()
    if not admin:
        return None
    if check_password_hash(admin.password, password):
        return admin
    return None


def ensure_admin(username, password):
    admin = Admin.query.filter_by(username=username).first()
    if admin:
        return admin

    admin = Admin(username=username, password=generate_password_hash(password))
    db.session.add(admin)
    db.session.commit()
    return admin
