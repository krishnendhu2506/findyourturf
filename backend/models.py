from datetime import datetime

from database import db


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password = db.Column(db.String(255), nullable=False)
    phone_number = db.Column(db.String(30), nullable=False)
    location = db.Column(db.String(120), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    bookings = db.relationship("Booking", backref="user", lazy=True)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "phone_number": self.phone_number,
            "location": self.location,
        }


class Admin(db.Model):
    __tablename__ = "admins"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(120), unique=True, nullable=False)
    password = db.Column(db.String(255), nullable=False)


class AdminSession(db.Model):
    __tablename__ = "admin_sessions"

    id = db.Column(db.Integer, primary_key=True)
    admin_id = db.Column(db.Integer, db.ForeignKey("admins.id"), nullable=False)
    token = db.Column(db.String(64), unique=True, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    admin = db.relationship("Admin")


class Turf(db.Model):
    __tablename__ = "turfs"

    id = db.Column(db.Integer, primary_key=True)
    turf_name = db.Column(db.String(120), nullable=False)
    location = db.Column(db.String(160), nullable=False)
    rating = db.Column(db.Float, nullable=False)
    price_per_hour = db.Column(db.Integer, nullable=False)
    image_url = db.Column(db.String(255), nullable=False)
    maps_link = db.Column(db.String(255), nullable=False)

    slots = db.relationship("TimeSlot", backref="turf", lazy=True, cascade="all, delete")
    bookings = db.relationship("Booking", backref="turf", lazy=True, cascade="all, delete")

    def to_dict(self):
        return {
            "id": self.id,
            "turf_name": self.turf_name,
            "location": self.location,
            "rating": self.rating,
            "price_per_hour": self.price_per_hour,
            "image_url": self.image_url,
            "maps_link": self.maps_link,
        }


class Booking(db.Model):
    __tablename__ = "bookings"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    turf_id = db.Column(db.Integer, db.ForeignKey("turfs.id"), nullable=False)
    date = db.Column(db.String(20), nullable=False)
    time_slot = db.Column(db.String(40), nullable=False)
    players_count = db.Column(db.Integer, nullable=True)
    special_notes = db.Column(db.Text, nullable=True)
    payment_screenshot = db.Column(db.String(255), nullable=True)
    status = db.Column(db.String(20), default="pending")
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    admin_message = db.Column(db.Text, nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "turf_id": self.turf_id,
            "date": self.date,
            "time_slot": self.time_slot,
            "status": self.status,
            "players_count": self.players_count,
            "special_notes": self.special_notes,
            "payment_screenshot": self.payment_screenshot,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "admin_message": self.admin_message,
            "turf": self.turf.to_dict() if self.turf else None,
            "user": self.user.to_dict() if self.user else None,
        }


class TimeSlot(db.Model):
    __tablename__ = "time_slots"

    id = db.Column(db.Integer, primary_key=True)
    turf_id = db.Column(db.Integer, db.ForeignKey("turfs.id"), nullable=False)
    time_slot = db.Column(db.String(40), nullable=False)
    availability_status = db.Column(db.String(20), default="AVAILABLE")

    def to_dict(self):
        return {
            "id": self.id,
            "turf_id": self.turf_id,
            "time_slot": self.time_slot,
            "availability_status": self.availability_status,
        }


class RefundRequest(db.Model):
    __tablename__ = "refund_requests"

    id = db.Column(db.Integer, primary_key=True)
    booking_id = db.Column(db.Integer, db.ForeignKey("bookings.id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    reason = db.Column(db.Text, nullable=False)
    status = db.Column(db.String(20), default="pending")
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    booking = db.relationship("Booking", backref=db.backref("refund_requests", lazy=True))
    user = db.relationship("User")

    def to_dict(self):
        return {
            "id": self.id,
            "booking_id": self.booking_id,
            "user_id": self.user_id,
            "reason": self.reason,
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "booking": self.booking.to_dict() if self.booking else None,
            "user": self.user.to_dict() if self.user else None,
        }
