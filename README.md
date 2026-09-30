# QueueFlow

QueueFlow is a simple full-stack appointment and patient queue manager for clinics.
It combines a React/Vite dashboard with a FastAPI backend and PostgreSQL database.
Staff can book appointments, check patients in, call the next patient, and complete visits.
The dashboard also shows queue status, waiting estimates, services, and blocked time slots.
Demo clinic data is added automatically the first time the application starts.

## How to run

Install Docker Desktop, open a terminal in this folder, and run `docker compose up --build`.
Then open http://localhost:5173 for the app or http://localhost:8000/docs for the API.
