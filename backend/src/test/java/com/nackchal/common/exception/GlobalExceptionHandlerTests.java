package com.nackchal.common.exception;

import com.nackchal.common.exception.error.ErrorCode;
import com.nackchal.domain.auth.dto.request.RegistrationRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class GlobalExceptionHandlerTests {
    private MockMvc mvc;

    @BeforeEach
    void setup() {
        mvc = MockMvcBuilders.standaloneSetup(new ProbeController())
                .setControllerAdvice(new GlobalExceptionHandler()).build();
    }

    @Test
    void validationReturnsFieldNamesWithoutRejectedValues() throws Exception {
        var result = mvc.perform(post("/probe").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"private-email\",\"password\":\"secret\",\"nickname\":\"곰\"}"));

        assertError(result, 400, "INVALID_INPUT_VALUE")
                .andExpect(jsonPath("$.errors[?(@.field == 'email')]").isNotEmpty())
                .andExpect(jsonPath("$.errors[?(@.field == 'password')]").isNotEmpty())
                .andExpect(content().string(not(containsString("private-email"))))
                .andExpect(content().string(not(containsString("secret"))))
                .andExpect(jsonPath("$.errors[0].rejectedValue").doesNotExist());
    }

    @Test
    void malformedJsonReturnsSafeBodyError() throws Exception {
        var result = mvc.perform(post("/probe").contentType(MediaType.APPLICATION_JSON).content("{secret-json"));
        assertError(result, 400, "INVALID_REQUEST_BODY")
                .andExpect(content().string(not(containsString("secret-json"))));
    }

    @Test
    void unsupportedMethodPreservesAllowHeader() throws Exception {
        var result = mvc.perform(get("/probe"));
        assertError(result, 405, "METHOD_NOT_ALLOWED").andExpect(header().string("Allow", "POST"));
    }

    @Test
    void unsupportedMediaTypeIsNotAnInternalError() throws Exception {
        var result = mvc.perform(post("/probe").contentType(MediaType.TEXT_PLAIN).content("test"));
        assertError(result, 415, "UNSUPPORTED_MEDIA_TYPE");
    }

    @ParameterizedTest
    @CsvSource({"/parameter,MISSING_REQUEST_PARAMETER", "/parameter?page=text,INVALID_PARAMETER_TYPE",
            "/parameter?page=0,INVALID_INPUT_VALUE"})
    void parameterFailuresUseCommonFormat(String path, String code) throws Exception {
        assertError(mvc.perform(get(path)), 400, code).andExpect(jsonPath("$.errors[0].field").value("page"));
    }

    @Test
    void domainConflictUsesConfiguredCode() throws Exception {
        assertError(mvc.perform(get("/conflict")), 409, "EMAIL_UNAVAILABLE");
    }

    @Test
    void explicitHttpFailureKeepsItsStatusWithoutReasonLeak() throws Exception {
        assertError(mvc.perform(get("/missing")), 404, "RESOURCE_NOT_FOUND")
                .andExpect(content().string(not(containsString("internal-reason"))));
    }

    @ParameterizedTest
    @CsvSource({"/unexpected", "/integrity"})
    void unexpectedFailuresNeverExposeImplementationDetails(String path) throws Exception {
        assertError(mvc.perform(get(path)), 500, "INTERNAL_SERVER_ERROR")
                .andExpect(jsonPath("$.errors").isEmpty())
                .andExpect(content().string(not(containsString("secret-diagnostic"))))
                .andExpect(content().string(not(containsString("Exception"))));
    }

    private ResultActions assertError(ResultActions result, int status, String code) throws Exception {
        return result.andExpect(status().is(status)).andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.status").value(status)).andExpect(jsonPath("$.code").value(code))
                .andExpect(jsonPath("$.message").isString()).andExpect(jsonPath("$.errors").isArray())
                .andExpect(jsonPath("$.timestamp").doesNotExist()).andExpect(jsonPath("$.trace").doesNotExist());
    }

    @RestController
    static class ProbeController {
        @PostMapping("/probe") void register(@Valid @RequestBody RegistrationRequest request) {}
        @GetMapping("/parameter") int parameter(@RequestParam("page") @Min(1) int page) { return page; }
        @GetMapping("/conflict") void conflict() { throw new CustomException(ErrorCode.EMAIL_UNAVAILABLE); }
        @GetMapping("/missing") void missing() { throw new ResponseStatusException(HttpStatus.NOT_FOUND, "internal-reason"); }
        @GetMapping("/unexpected") void unexpected() { throw new IllegalStateException("secret-diagnostic"); }
        @GetMapping("/integrity") void integrity() { throw new DataIntegrityViolationException("secret-diagnostic"); }
    }
}
