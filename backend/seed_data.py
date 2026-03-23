from api.index import create_app
from auth import ensure_admin
from database import db
from models import Turf, TimeSlot


SLOT_TIMES = [
    "06:00 AM",
    "07:00 AM",
    "08:00 AM",
    "09:00 AM",
    "10:00 AM",
    "11:00 AM",
    "04:00 PM",
    "05:00 PM",
    "06:00 PM",
    "07:00 PM",
    "08:00 PM",
    "09:00 PM",
]

def build_maps_link(turf_name, location):
    query = f"{turf_name} {location}".strip().replace(" ", "+")
    return f"https://www.google.com/maps/search/?api=1&query={query}"


SEED_TURFS = [
    {"id": 1, "turf_name": "Turf 7 Velanthavalam", "location": "Velanthavalam Palakkad Kerala", "rating": 4.3, "price_per_hour": 1000, "image_url": "assets/turf-images/turf-1.svg"},
    {"id": 2, "turf_name": "Jeugo Sports Arena 2", "location": "Koppam Junction Palakkad Kerala", "rating": 4.4, "price_per_hour": 1200, "image_url": "assets/turf-images/turf-2.svg"},
    {"id": 3, "turf_name": "Avyaan Soccer Zone", "location": "Nurani Palakkad Kerala", "rating": 4.2, "price_per_hour": 1100, "image_url": "assets/turf-images/turf-3.svg"},
    {"id": 4, "turf_name": "Mountz Sports Land", "location": "Mannarkkad Palakkad Kerala", "rating": 4.5, "price_per_hour": 1200, "image_url": "assets/turf-images/turf-1.svg"},
    {"id": 5, "turf_name": "Strikers Arena", "location": "Ottapalam Palakkad Kerala", "rating": 4.3, "price_per_hour": 1000, "image_url": "assets/turf-images/turf-2.svg"},
    {"id": 6, "turf_name": "Play City 9 Soapy Kick", "location": "Palakkad Town Kerala", "rating": 4.1, "price_per_hour": 900, "image_url": "assets/turf-images/turf-3.svg"},
    {"id": 7, "turf_name": "Emerald Elclasico", "location": "Kuzhalmannam Palakkad Kerala", "rating": 4.4, "price_per_hour": 1100, "image_url": "assets/turf-images/turf-1.svg"},
    {"id": 8, "turf_name": "Rocky Sports Football Turf", "location": "Hemambika Nagar Palakkad Kerala", "rating": 4.2, "price_per_hour": 1000, "image_url": "assets/turf-images/turf-2.svg"},
    {"id": 9, "turf_name": "GAZEBO Sports Arena", "location": "Vaniyamkulam Palakkad Kerala", "rating": 4.3, "price_per_hour": 1000, "image_url": "assets/turf-images/turf-3.svg"},
    {"id": 10, "turf_name": "Camp Now Karakuthangadi", "location": "Karuvanpadi Palakkad Kerala", "rating": 4.0, "price_per_hour": 900, "image_url": "assets/turf-images/turf-1.svg"},
    {"id": 11, "turf_name": "Maracana Football Turf", "location": "Vidyut Nagar Palakkad Kerala", "rating": 4.3, "price_per_hour": 1100, "image_url": "assets/turf-images/turf-2.svg"},
    {"id": 12, "turf_name": "Old Trafford Football Turf", "location": "Stadium Bypass Palakkad Kerala", "rating": 4.4, "price_per_hour": 1200, "image_url": "assets/turf-images/turf-3.svg"},
    {"id": 13, "turf_name": "Noorani Football Ground", "location": "Nurani Palakkad Kerala", "rating": 4.6, "price_per_hour": 800, "image_url": "assets/turf-images/turf-1.svg"},
    {"id": 14, "turf_name": "M R Sports City", "location": "Chunangad Ottapalam Kerala", "rating": 4.2, "price_per_hour": 1000, "image_url": "assets/turf-images/turf-2.svg"},
    {"id": 15, "turf_name": "Thrithala Football Turf", "location": "Thrithala Palakkad Kerala", "rating": 4.1, "price_per_hour": 900, "image_url": "assets/turf-images/turf-3.svg"},
    {"id": 16, "turf_name": "Koduvayoor Football Turf", "location": "Koduvayoor Palakkad Kerala", "rating": 4.0, "price_per_hour": 850, "image_url": "assets/turf-images/turf-1.svg"},
    {"id": 17, "turf_name": "Chittur Soccer Turf", "location": "Chittur Palakkad Kerala", "rating": 4.2, "price_per_hour": 900, "image_url": "assets/turf-images/turf-2.svg"},
    {"id": 18, "turf_name": "Mannarkkad Football Arena", "location": "Mannarkkad Palakkad Kerala", "rating": 4.1, "price_per_hour": 950, "image_url": "assets/turf-images/turf-3.svg"},
    {"id": 19, "turf_name": "Ottapalam Sports Turf", "location": "Ottapalam Palakkad Kerala", "rating": 4.2, "price_per_hour": 950, "image_url": "assets/turf-images/turf-1.svg"},
    {"id": 20, "turf_name": "Koppam Football Turf", "location": "Koppam Palakkad Kerala", "rating": 4.0, "price_per_hour": 900, "image_url": "assets/turf-images/turf-2.svg"},
    {"id": 21, "turf_name": "Kuzhalmannam Soccer Arena", "location": "Kuzhalmannam Palakkad Kerala", "rating": 4.1, "price_per_hour": 950, "image_url": "assets/turf-images/turf-3.svg"},
    {"id": 22, "turf_name": "Palakkad Sports Arena", "location": "Palakkad Town Kerala", "rating": 4.3, "price_per_hour": 1100, "image_url": "assets/turf-images/turf-1.svg"},
    {"id": 23, "turf_name": "Victory Football Turf", "location": "Olavakkode Palakkad Kerala", "rating": 4.1, "price_per_hour": 900, "image_url": "assets/turf-images/turf-2.svg"},
    {"id": 24, "turf_name": "Goal Arena Turf", "location": "Malampuzha Road Palakkad Kerala", "rating": 4.2, "price_per_hour": 1000, "image_url": "assets/turf-images/turf-3.svg"},
    {"id": 25, "turf_name": "Green Arena Turf", "location": "Palakkad Town Kerala", "rating": 4.3, "price_per_hour": 1100, "image_url": "assets/turf-images/turf-1.svg"},
    {"id": 26, "turf_name": "Champions Turf", "location": "Kanjikode Palakkad Kerala", "rating": 4.2, "price_per_hour": 1000, "image_url": "assets/turf-images/turf-2.svg"},
    {"id": 27, "turf_name": "Kickoff Sports Turf", "location": "Kalmandapam Palakkad Kerala", "rating": 4.0, "price_per_hour": 850, "image_url": "assets/turf-images/turf-3.svg"},
    {"id": 28, "turf_name": "Hills Arena Turf", "location": "Calicut Bypass Palakkad Kerala", "rating": 4.3, "price_per_hour": 1100, "image_url": "assets/turf-images/turf-1.svg"},
    {"id": 29, "turf_name": "Seven Goals Football Turf", "location": "Malampuzha Palakkad Kerala", "rating": 4.2, "price_per_hour": 950, "image_url": "assets/turf-images/turf-2.svg"},
    {"id": 30, "turf_name": "Galaxy Sports Turf", "location": "Pudussery Palakkad Kerala", "rating": 4.1, "price_per_hour": 950, "image_url": "assets/turf-images/turf-3.svg"},
]


app = create_app()


with app.app_context():
    db.create_all()

    ensure_admin("admin", "admin123")

    if Turf.query.count() == 0:
        for turf_data in SEED_TURFS:
            turf_data["maps_link"] = build_maps_link(turf_data["turf_name"], turf_data["location"])
            turf = Turf(**turf_data)
            db.session.add(turf)
        db.session.commit()
    else:
        for turf in Turf.query.all():
            if not turf.maps_link:
                turf.maps_link = build_maps_link(turf.turf_name, turf.location)
        db.session.commit()

    for turf in Turf.query.all():
        existing_slots = TimeSlot.query.filter_by(turf_id=turf.id).count()
        if existing_slots == 0:
            for slot in SLOT_TIMES:
                db.session.add(TimeSlot(turf_id=turf.id, time_slot=slot, availability_status="AVAILABLE"))
    db.session.commit()

    print("Seeded turfs:", Turf.query.count())
    print("Seeded slots:", TimeSlot.query.count())
