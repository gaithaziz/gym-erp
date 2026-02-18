from typing import Generic, TypeVar, Optional
from pydantic import BaseModel

T = TypeVar("T")

class ResponseBase(BaseModel, Generic[T]):
    data: Optional[T] = None
    message: Optional[str] = None
    success: bool = True

class StandardResponse(ResponseBase[T]):
    pass
