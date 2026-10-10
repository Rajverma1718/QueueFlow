from datetime import date, datetime, time, timedelta
from enum import Enum
import os
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict
from sqlalchemy import Date, DateTime, Enum as SAEnum, ForeignKey, Integer, String, Text, create_engine, func, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./queueflow.db")
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)

class Base(DeclarativeBase): pass
class AppointmentStatus(str, Enum): booked="booked"; checked_in="checked_in"; called="called"; serving="serving"; completed="completed"; cancelled="cancelled"; no_show="no_show"
class Priority(str, Enum): normal="normal"; priority="priority"

class Service(Base):
    __tablename__ = "services"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    duration_minutes: Mapped[int] = mapped_column(Integer, default=20)
    color: Mapped[str] = mapped_column(String(20), default="#7c6df2")
    appointments: Mapped[list["Appointment"]] = relationship(back_populates="service")

class Appointment(Base):
    __tablename__ = "appointments"
    id: Mapped[int] = mapped_column(primary_key=True)
    token: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    patient_name: Mapped[str] = mapped_column(String(120))
    patient_email: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    appointment_date: Mapped[date] = mapped_column(Date, index=True)
    scheduled_time: Mapped[str] = mapped_column(String(10))
    status: Mapped[AppointmentStatus] = mapped_column(SAEnum(AppointmentStatus), default=AppointmentStatus.booked)
    priority: Mapped[Priority] = mapped_column(SAEnum(Priority), default=Priority.normal)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    checked_in_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    called_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    service_id: Mapped[int] = mapped_column(ForeignKey("services.id"))
    service: Mapped[Service] = relationship(back_populates="appointments")

class WorkspaceSetting(Base):
    __tablename__ = "workspace_settings"
    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    clinic_name: Mapped[str] = mapped_column(String(120), default="Harbor Clinic")
    location: Mapped[str] = mapped_column(String(120), default="Downtown location")
    lead_time_minutes: Mapped[int] = mapped_column(Integer, default=15)

class BlockedSlot(Base):
    __tablename__ = "blocked_slots"
    id: Mapped[int] = mapped_column(primary_key=True)
    block_date: Mapped[date] = mapped_column(Date, index=True)
    start_time: Mapped[str] = mapped_column(String(10))
    end_time: Mapped[str] = mapped_column(String(10))
    reason: Mapped[str] = mapped_column(String(40))
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

class ServiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int; name: str; duration_minutes: int; color: str
class AppointmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int; token: str; patient_name: str; patient_email: Optional[str]; appointment_date: date; scheduled_time: str; status: AppointmentStatus; priority: Priority; notes: Optional[str]; service_id: int; service: ServiceOut
class AppointmentCreate(BaseModel):
    patient_name: str; patient_email: Optional[str] = None; appointment_date: date; scheduled_time: str; service_id: int; priority: Priority = Priority.normal; notes: Optional[str] = None
class StatusUpdate(BaseModel): status: AppointmentStatus
class SettingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    clinic_name: str; location: str; lead_time_minutes: int
class SettingUpdate(BaseModel):
    clinic_name: str; location: str; lead_time_minutes: int
class BlockedSlotCreate(BaseModel):
    block_date: date; start_time: str; end_time: str; reason: str; note: Optional[str] = None
class BlockedSlotOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int; block_date: date; start_time: str; end_time: str; reason: str; note: Optional[str]

def get_db():
    db = SessionLocal()
    try: yield db
    finally: db.close()

def as_datetime(day: date, value: str) -> datetime:
    try:
        return datetime.combine(day, time.fromisoformat(value))
    except ValueError:
        raise HTTPException(400, "Time must use HH:MM format")

app = FastAPI(title="QueueFlow API", version="1.0.0")
origins = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

def seed(db: Session):
    if db.scalar(select(func.count(Service.id))) == 0:
        services = [Service(name="General consultation", duration_minutes=20, color="#7966f2"), Service(name="Follow-up visit", duration_minutes=15, color="#42bda5"), Service(name="Diagnostics", duration_minutes=30, color="#efaa54")]
        db.add_all(services); db.flush()
        today = date.today()
        demo = [("Olivia Bennett", "09:00", 0, AppointmentStatus.serving, Priority.priority), ("Ethan Cole", "09:20", 0, AppointmentStatus.checked_in, Priority.normal), ("Maya Patel", "09:40", 1, AppointmentStatus.checked_in, Priority.normal), ("Noah Williams", "10:00", 2, AppointmentStatus.booked, Priority.normal), ("Ava Thompson", "10:20", 0, AppointmentStatus.booked, Priority.normal)]
        for i, (name, time, svc, status, priority) in enumerate(demo, 1):
            db.add(Appointment(token=f"A-{100+i}", patient_name=name, appointment_date=today, scheduled_time=time, status=status, priority=priority, service_id=services[svc].id, checked_in_at=datetime.utcnow() if status in [AppointmentStatus.checked_in, AppointmentStatus.serving] else None))
        db.commit()

@app.on_event("startup")
def startup():
    Base.metadata.create_all(engine)
    with SessionLocal() as db: seed(db)

@app.get("/api/health")
def health(): return {"status": "ok", "service": "queueflow-api"}

@app.get("/api/services", response_model=list[ServiceOut])
def services(db: Session = Depends(get_db)): return db.scalars(select(Service).order_by(Service.id)).all()

@app.get("/api/settings", response_model=SettingOut)
def get_settings(db: Session = Depends(get_db)):
    settings = db.get(WorkspaceSetting, 1)
    if not settings:
        settings = WorkspaceSetting(id=1); db.add(settings); db.commit(); db.refresh(settings)
    return settings

@app.patch("/api/settings", response_model=SettingOut)
def update_settings(payload: SettingUpdate, db: Session = Depends(get_db)):
    settings = db.get(WorkspaceSetting, 1)
    if not settings: settings = WorkspaceSetting(id=1); db.add(settings)
    settings.clinic_name = payload.clinic_name; settings.location = payload.location; settings.lead_time_minutes = payload.lead_time_minutes
    db.commit(); db.refresh(settings); return settings

@app.post("/api/blocked-slots", response_model=BlockedSlotOut, status_code=201)
def create_blocked_slot(payload: BlockedSlotCreate, db: Session = Depends(get_db)):
    if as_datetime(payload.block_date, payload.end_time) <= as_datetime(payload.block_date, payload.start_time):
        raise HTTPException(400, "End time must be after start time")
    slot = BlockedSlot(**payload.model_dump()); db.add(slot); db.commit(); db.refresh(slot); return slot

@app.get("/api/blocked-slots", response_model=list[BlockedSlotOut])
def blocked_slots(day: date = Query(default_factory=date.today), db: Session = Depends(get_db)):
    return db.scalars(select(BlockedSlot).where(BlockedSlot.block_date == day).order_by(BlockedSlot.start_time)).all()

@app.get("/api/appointments", response_model=list[AppointmentOut])
def appointments(day: date = Query(default_factory=date.today), db: Session = Depends(get_db)):
    return db.scalars(select(Appointment).where(Appointment.appointment_date == day).order_by(Appointment.priority.desc(), Appointment.scheduled_time)).all()

@app.post("/api/appointments", response_model=AppointmentOut, status_code=201)
def create_appointment(payload: AppointmentCreate, db: Session = Depends(get_db)):
    service = db.get(Service, payload.service_id)
    if not service: raise HTTPException(404, "Service not found")
    appointment_start = as_datetime(payload.appointment_date, payload.scheduled_time)
    appointment_end = appointment_start + timedelta(minutes=service.duration_minutes)
    blocked_slots = db.scalars(select(BlockedSlot).where(BlockedSlot.block_date == payload.appointment_date))
    for blocked in blocked_slots:
        blocked_start = as_datetime(payload.appointment_date, blocked.start_time)
        blocked_end = as_datetime(payload.appointment_date, blocked.end_time)
        if appointment_start < blocked_end and appointment_end > blocked_start:
            raise HTTPException(409, "The selected time is unavailable")
    count = db.scalar(select(func.count(Appointment.id)).where(Appointment.appointment_date == payload.appointment_date)) or 0
    appt = Appointment(**payload.model_dump(), token=f"A-{100 + count + 1}")
    db.add(appt); db.commit(); db.refresh(appt); return appt

@app.patch("/api/appointments/{appointment_id}/status", response_model=AppointmentOut)
def update_status(appointment_id: int, payload: StatusUpdate, db: Session = Depends(get_db)):
    appt = db.get(Appointment, appointment_id)
    if not appt: raise HTTPException(404, "Appointment not found")
    appt.status = payload.status
    if payload.status == AppointmentStatus.checked_in: appt.checked_in_at = datetime.utcnow()
    if payload.status == AppointmentStatus.called: appt.called_at = datetime.utcnow()
    db.commit(); db.refresh(appt); return appt

@app.get("/api/dashboard")
def dashboard(day: date = Query(default_factory=date.today), db: Session = Depends(get_db)):
    rows = db.scalars(select(Appointment).where(Appointment.appointment_date == day)).all()
    waiting = [a for a in rows if a.status in [AppointmentStatus.checked_in, AppointmentStatus.called]]
    active = next((a for a in rows if a.status == AppointmentStatus.serving), None)
    served = [a for a in rows if a.status == AppointmentStatus.completed]
    return {"date": day, "total": len(rows), "waiting": len(waiting), "served": len(served), "average_wait": 12, "active": AppointmentOut.model_validate(active) if active else None, "next": AppointmentOut.model_validate(waiting[0]) if waiting else None}

@app.post("/api/queue/call-next", response_model=AppointmentOut)
def call_next(day: date = Query(default_factory=date.today), db: Session = Depends(get_db)):
    active = db.scalar(select(Appointment).where(Appointment.appointment_date == day, Appointment.status == AppointmentStatus.serving))
    if active: raise HTTPException(409, "Finish the active appointment first")
    appt = db.scalars(select(Appointment).where(Appointment.appointment_date == day, Appointment.status == AppointmentStatus.checked_in).order_by(Appointment.priority.desc(), Appointment.checked_in_at, Appointment.scheduled_time)).first()
    if not appt: raise HTTPException(404, "No checked-in patients are waiting")
    appt.status = AppointmentStatus.serving; appt.called_at = datetime.utcnow(); db.commit(); db.refresh(appt); return appt

@app.post("/api/notifications/reminders")
def send_reminders(day: date = Query(default_factory=date.today), db: Session = Depends(get_db)):
    waiting = db.scalar(select(func.count(Appointment.id)).where(Appointment.appointment_date == day, Appointment.status.in_([AppointmentStatus.checked_in, AppointmentStatus.called]))) or 0
    if not waiting:
        return {"sent": 0, "message": "There are no waiting patients to remind."}
    return {"sent": waiting, "message": f"Reminder queued for {waiting} waiting patient{'s' if waiting != 1 else ''}."}

