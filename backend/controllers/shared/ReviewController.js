const ReviewService = require('../../services/ReviewService');
const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');

class ReviewController {
  listForProperty = asyncHandler(async (req, res) => {
    const reviews = await ReviewService.listApprovedForProperty(req.params.propertyId);
    sendSuccess(res, { data: { reviews } });
  });

  submit = asyncHandler(async (req, res) => {
    const review = await ReviewService.submitReview(req.user.id, { ...req.body, propertyId: req.params.propertyId });
    sendSuccess(res, { statusCode: 201, data: { review } });
  });

  /** Drives the review prompt shown before a tenant closes their account. */
  listEligible = asyncHandler(async (req, res) => {
    const reservations = await ReviewService.listEligibleReservations(req.user.id);
    sendSuccess(res, { data: { eligibleReservations: reservations } });
  });

  listPendingModeration = asyncHandler(async (req, res) => {
    const reviews = await ReviewService.listPendingModeration();
    sendSuccess(res, { data: { reviews } });
  });

  moderate = asyncHandler(async (req, res) => {
    const review = await ReviewService.moderate(req.params.id, req.user, req.body);
    sendSuccess(res, { data: { review } });
  });
}

module.exports = new ReviewController();
