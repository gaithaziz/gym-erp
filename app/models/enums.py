from enum import Enum

class Role(str, Enum):
    ADMIN = "ADMIN"
    MANAGER = "MANAGER"
    FRONT_DESK = "FRONT_DESK"
    RECEPTION = "RECEPTION"
    COACH = "COACH"
    EMPLOYEE = "EMPLOYEE"
    CASHIER = "CASHIER"
    CUSTOMER = "CUSTOMER"
